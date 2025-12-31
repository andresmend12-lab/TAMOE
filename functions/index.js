const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

const db = admin.database();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGION = "europe-west1";

// ============================================
// UTILITY FUNCTIONS
// ============================================

const getMailSettings = () => {
  const config = typeof functions.config === "function" ? functions.config() : {};
  const apiKey = process.env.SENDGRID_API_KEY || (config.sendgrid && config.sendgrid.key);
  const sender = process.env.INVITE_SENDER || (config.sendgrid && config.sendgrid.sender);
  if (!apiKey || !sender) {
    return null;
  }
  return { apiKey, sender };
};

const isValidUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
};

const sanitizeString = (str, maxLength = 500) => {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLength);
};

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

async function checkRateLimit(uid, action) {
  const rateLimitRef = db.ref(`system/rate_limits/${uid}/${action}`);
  const now = Date.now();

  const snapshot = await rateLimitRef.once("value");
  const data = snapshot.val() || { count: 0, windowStart: now };

  // Reset window if expired
  if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
    await rateLimitRef.set({ count: 1, windowStart: now });
    return true;
  }

  // Check if limit exceeded
  if (data.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  // Increment counter
  await rateLimitRef.update({ count: data.count + 1 });
  return true;
}

// ============================================
// EMAIL FUNCTIONS
// ============================================

exports.sendInviteEmail = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para enviar invitaciones."
      );
    }

    // Rate limiting
    const allowed = await checkRateLimit(context.auth.uid, "sendInvite");
    if (!allowed) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Has excedido el límite de invitaciones. Intenta de nuevo en un minuto."
      );
    }

    const email = sanitizeString(data?.email, 254);
    const registerUrl = sanitizeString(data?.registerUrl, 500);

    if (!EMAIL_REGEX.test(email) || !isValidUrl(registerUrl)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Parámetros de invitación inválidos."
      );
    }

    const settings = getMailSettings();
    if (!settings) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "El servidor de correo no está configurado."
      );
    }

    sgMail.setApiKey(settings.apiKey);

    const subject = "Invitación a Tamoe";
    const text = `Hola,\n\nTe invito a registrarte en Tamoe.\n\nEnlace de registro: ${registerUrl}\n\nGracias.`;
    const html = [
      "<p>Hola,</p>",
      "<p>Te invito a registrarte en Tamoe.</p>",
      `<p>Enlace de registro: <a href="${registerUrl}">${registerUrl}</a></p>`,
      "<p>Gracias.</p>",
    ].join("");

    await sgMail.send({
      to: email,
      from: settings.sender,
      subject,
      text,
      html,
    });

    return { ok: true };
  });

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validates client creation with server-side checks
 */
exports.validateClientCreation = functions
  .region(REGION)
  .database.ref("/clients/{clientId}")
  .onCreate(async (snapshot, context) => {
    const clientData = snapshot.val();
    const clientId = context.params.clientId;

    // Validate required fields
    if (!clientData.name || !clientData.createdBy) {
      console.error(`Invalid client ${clientId}: missing required fields`);
      await snapshot.ref.remove();
      return null;
    }

    // Validate name length
    if (clientData.name.length > 200) {
      console.error(`Invalid client ${clientId}: name too long`);
      await snapshot.ref.update({
        name: clientData.name.slice(0, 200)
      });
    }

    // Log creation
    console.log(`Client ${clientId} created by ${clientData.createdBy}`);
    return null;
  });

/**
 * Validates automation creation
 */
exports.validateAutomationCreation = functions
  .region(REGION)
  .database.ref("/automations/{automationId}")
  .onCreate(async (snapshot, context) => {
    const automationData = snapshot.val();
    const automationId = context.params.automationId;

    // Validate required fields
    if (!automationData.name || !automationData.createdBy) {
      console.error(`Invalid automation ${automationId}: missing required fields`);
      await snapshot.ref.remove();
      return null;
    }

    // Validate name length
    if (automationData.name.length > 200) {
      await snapshot.ref.update({
        name: automationData.name.slice(0, 200)
      });
    }

    console.log(`Automation ${automationId} created by ${automationData.createdBy}`);
    return null;
  });

// ============================================
// SECURITY TRIGGERS
// ============================================

/**
 * Log and validate client deletions
 */
exports.onClientDelete = functions
  .region(REGION)
  .database.ref("/clients/{clientId}")
  .onDelete(async (snapshot, context) => {
    const clientData = snapshot.val();
    const clientId = context.params.clientId;

    // Log deletion to audit trail
    const auditRef = db.ref("system/audit_log").push();
    await auditRef.set({
      action: "client_deleted",
      clientId,
      clientName: clientData?.name || "Unknown",
      deletedBy: clientData?.createdBy || "Unknown",
      timestamp: admin.database.ServerValue.TIMESTAMP,
      data: clientData
    });

    console.log(`Client ${clientId} (${clientData?.name}) deleted`);
    return null;
  });

/**
 * Prevent unauthorized notification writes
 */
exports.validateNotificationWrite = functions
  .region(REGION)
  .database.ref("/notifications/{uid}/{notificationId}")
  .onCreate(async (snapshot, context) => {
    const notification = snapshot.val();
    const targetUid = context.params.uid;

    // Validate notification structure
    if (!notification.title || !notification.createdAt) {
      console.error(`Invalid notification for ${targetUid}: missing required fields`);
      await snapshot.ref.remove();
      return null;
    }

    // Sanitize notification content
    const updates = {};
    if (notification.title && notification.title.length > 200) {
      updates.title = notification.title.slice(0, 200);
    }
    if (notification.taskName && notification.taskName.length > 300) {
      updates.taskName = notification.taskName.slice(0, 300);
    }

    if (Object.keys(updates).length > 0) {
      await snapshot.ref.update(updates);
    }

    return null;
  });

// ============================================
// DATA INTEGRITY FUNCTIONS
// ============================================

/**
 * Cascades status updates through hierarchy
 */
exports.cascadeStatusUpdate = functions
  .region(REGION)
  .database.ref("/clients/{clientId}/projects/{projectId}/products/{productId}/status")
  .onUpdate(async (change, context) => {
    const newStatus = change.after.val();
    const { clientId, projectId, productId } = context.params;

    if (newStatus !== "Finalizado") return null;

    // Check if all products are finalized to update project
    const productsRef = db.ref(`/clients/${clientId}/projects/${projectId}/products`);
    const productsSnapshot = await productsRef.once("value");
    const products = productsSnapshot.val() || {};

    const allFinalized = Object.values(products).every(
      (product) => product.status === "Finalizado"
    );

    if (allFinalized) {
      await db.ref(`/clients/${clientId}/projects/${projectId}/status`).set("Finalizado");
      console.log(`Project ${projectId} auto-finalized (all products complete)`);
    }

    return null;
  });

// ============================================
// SCHEDULED FUNCTIONS
// ============================================

/**
 * Daily cleanup of old rate limit data
 */
exports.cleanupRateLimits = functions
  .region(REGION)
  .pubsub.schedule("every 24 hours")
  .onRun(async (context) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    const rateLimitsRef = db.ref("system/rate_limits");

    const snapshot = await rateLimitsRef.once("value");
    const rateLimits = snapshot.val() || {};

    const deletions = [];
    for (const [uid, actions] of Object.entries(rateLimits)) {
      for (const [action, data] of Object.entries(actions || {})) {
        if (data.windowStart < cutoff) {
          deletions.push(rateLimitsRef.child(`${uid}/${action}`).remove());
        }
      }
    }

    await Promise.all(deletions);
    console.log(`Cleaned up ${deletions.length} expired rate limit entries`);
    return null;
  });

/**
 * Weekly backup reminder (logs for manual backup trigger)
 */
exports.weeklyBackupReminder = functions
  .region(REGION)
  .pubsub.schedule("every sunday 02:00")
  .timeZone("Europe/Madrid")
  .onRun(async (context) => {
    console.log("Weekly backup reminder: Consider running a database backup");

    // Log backup reminder to system
    const reminderRef = db.ref("system/backup_reminders").push();
    await reminderRef.set({
      timestamp: admin.database.ServerValue.TIMESTAMP,
      message: "Weekly backup reminder"
    });

    return null;
  });

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Get system statistics (admin only)
 */
exports.getSystemStats = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Autenticación requerida.");
    }

    // Check if user is admin
    const userRef = db.ref(`users/${context.auth.uid}/role`);
    const roleSnapshot = await userRef.once("value");
    const role = roleSnapshot.val();

    if (role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Solo administradores.");
    }

    // Gather statistics
    const [clientsSnap, usersSnap, automationsSnap] = await Promise.all([
      db.ref("clients").once("value"),
      db.ref("users").once("value"),
      db.ref("automations").once("value")
    ]);

    const clients = clientsSnap.val() || {};
    const users = usersSnap.val() || {};
    const automations = automationsSnap.val() || {};

    let totalProjects = 0;
    let totalProducts = 0;
    let totalTasks = 0;

    for (const client of Object.values(clients)) {
      const projects = client.projects || {};
      totalProjects += Object.keys(projects).length;

      for (const project of Object.values(projects)) {
        const products = project.products || {};
        totalProducts += Object.keys(products).length;

        // Count tasks at project level
        totalTasks += Object.keys(project.tasks || {}).length;

        for (const product of Object.values(products)) {
          totalTasks += Object.keys(product.tasks || {}).length;
        }
      }
    }

    return {
      clients: Object.keys(clients).length,
      users: Object.keys(users).length,
      automations: Object.keys(automations).length,
      projects: totalProjects,
      products: totalProducts,
      tasks: totalTasks,
      timestamp: Date.now()
    };
  });

/**
 * Export client data (for backup)
 */
exports.exportClientData = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Autenticación requerida.");
    }

    const clientId = sanitizeString(data?.clientId, 100);
    if (!clientId) {
      throw new functions.https.HttpsError("invalid-argument", "Client ID requerido.");
    }

    // Rate limiting
    const allowed = await checkRateLimit(context.auth.uid, "exportClient");
    if (!allowed) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Has excedido el límite de exportaciones. Intenta de nuevo en un minuto."
      );
    }

    // Get client data
    const clientRef = db.ref(`clients/${clientId}`);
    const clientSnapshot = await clientRef.once("value");
    const clientData = clientSnapshot.val();

    if (!clientData) {
      throw new functions.https.HttpsError("not-found", "Cliente no encontrado.");
    }

    // Verify user has access (is creator or admin)
    const userRoleRef = db.ref(`users/${context.auth.uid}/role`);
    const roleSnap = await userRoleRef.once("value");
    const isAdmin = roleSnap.val() === "admin";

    if (clientData.createdBy !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError("permission-denied", "No tienes acceso a este cliente.");
    }

    return {
      exportedAt: new Date().toISOString(),
      exportedBy: context.auth.uid,
      client: clientData
    };
  });
