const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

exports.sendInviteEmail = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes iniciar sesi\u00F3n para enviar invitaciones."
      );
    }

    const email = String(data && data.email ? data.email : "").trim();
    const registerUrl = String(data && data.registerUrl ? data.registerUrl : "").trim();

    if (!EMAIL_REGEX.test(email) || !isValidUrl(registerUrl)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Par\u00E1metros de invitaci\u00F3n inv\u00E1lidos."
      );
    }

    const settings = getMailSettings();
    if (!settings) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "El servidor de correo no est\u00E1 configurado."
      );
    }

    sgMail.setApiKey(settings.apiKey);

    const subject = "Invitaci\u00F3n a Tamoe";
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
