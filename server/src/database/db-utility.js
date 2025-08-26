import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import config from '../config/config'; // si es ESM con extensión: '../config/config.js'

/**
 * Helpers seguros
 */
const ensureArray = (db, path) => {
  try {
    const data = db.getData(path);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // Si no existe la clave, inicialízala como []
    db.push(path, [], true);
    return [];
  }
};

const safeGetArray = (db, path) => {
  try {
    const data = db.getData(path);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.name === 'DataError') return [];
    throw e;
  }
};

// Bases de datos (usa el separador '.')
const apps = new JsonDB(new Config(`${config.database_directory}/applications-data`, true, true, '.'));
const contentItemMessage = new JsonDB(new Config(`${config.database_directory}/cim-data`, true, true, '.'));
const auth = new JsonDB(new Config(`${config.database_directory}/auth-data`, true, true, '.'));

// Asegura estructuras mínimas
ensureArray(apps, '.applications-data');
ensureArray(contentItemMessage, '.cim-data');
ensureArray(auth, '.auth-data');

const jwtApi = '/api/v1/gateway/oauth2/jwttoken';
const oidcApi = '/api/v1/gateway/oidcauth';

/* ===================== Applications ===================== */

export const getAllApplications = () => {
  return safeGetArray(apps, '.applications-data');
};

export const getAppById = (appId) => {
  try {
    // Busca por 'id' primero; si no, por 'appId'
    let idx = apps.getIndex('.applications-data', appId, 'id');
    if (idx === -1) idx = apps.getIndex('.applications-data', appId, 'appId');
    if (idx === -1) return null;
    return apps.getData(`.applications-data[${idx}]`);
  } catch (error) {
    return error;
  }
};

export const insertNewApp = (app) => {
  const id = app.appId ?? app.id;
  if (!id) return 'missing id/appId';

  try {
    let idx = apps.getIndex('.applications-data', id, 'id');
    if (idx === -1) idx = apps.getIndex('.applications-data', id, 'appId');
    if (idx !== -1) return 'application already exists';

    apps.push('.applications-data[]', {
      id,
      appId: app.appId ?? id,
      setup: {
        name: app.name,
        key: app.appKey,
        secret: app.appSecret,
        devPortalUrl: app.devPortalUrl,
        jwtUrl: `${app.devPortalUrl}${jwtApi}`,
        oidcUrl: `${app.devPortalUrl}${oidcApi}`,
        issuer: 'www.blackboard.com'
      }
    });
    return 'success';
  } catch (error) {
    return error;
  }
};

export const deleteAppById = (appId) => {
  try {
    let idx = apps.getIndex('.applications-data', appId, 'id');
    if (idx === -1) idx = apps.getIndex('.applications-data', appId, 'appId');
    if (idx === -1) return 'not found';
    apps.delete(`.applications-data[${idx}]`);
    return `${appId} has been deleted`;
  } catch (e) {
    return e;
  }
};

/* ===================== Auth / State ===================== */

export const getAuthFromState = (state) => {
  try {
    const index = auth.getIndex('.auth-data', state, 'state');
    if (index === -1) return null;
    return auth.getData(`.auth-data[${index}].auth`);
  } catch (error) {
    return error;
  }
};

export const getAllAuth = () => {
  return safeGetArray(auth, '.auth-data');
};

export const insertNewState = async (state) => {
  const twoHoursFromNowMs = Date.now() + 2 * 60 * 60 * 1000;

  try {
    const idx = auth.getIndex('.auth-data', state, 'state');
    if (idx !== -1) {
      console.log(`${state} already has a record`);
      return 'exists';
    }

    auth.push('.auth-data[]', {
      expirationDate: twoHoursFromNowMs, // en ms
      state
    });
    return 'success';
  } catch (e) {
    return e;
  }
};

export const insertNewAuthToken = async (state, token, type) => {
  try {
    const index = auth.getIndex('.auth-data', state, 'state');
    if (index === -1) return 'state not found';

    // Escribe directamente la propiedad anidada
    auth.push(`.auth-data[${index}].auth.${type}`, token, true);
    console.log(`${type} added to state: ${state}`);
    return 'success';
  } catch (e) {
    console.log(e);
    return e;
  }
};

/* ===================== CIM ===================== */

export const insertNewCIM = (cimKey, cim) => {
  const twoHoursFromNowMs = Date.now() + 2 * 60 * 60 * 1000;
  try {
    contentItemMessage.push('.cim-data[]', {
      expirationDate: twoHoursFromNowMs,
      key: cimKey,
      message: cim
    });
    return 'success';
  } catch (error) {
    return error;
  }
};

export const getCIMFromKey = (cimKey) => {
  try {
    const index = contentItemMessage.getIndex('.cim-data', cimKey, 'key');
    if (index === -1) return null;
    return contentItemMessage.getData(`.cim-data[${index}]`);
  } catch (error) {
    console.log(error);
    return null;
  }
};

/* ===================== Expiración / Limpieza ===================== */

export const getExpiredSessions = () => {
  const nowMs = Date.now();
  const sessions = getAllAuth();
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const expired = [];
  sessions.forEach((session) => {
    // Si hay JWT con exp (en segundos)
    const expSec = session?.auth?.jwt?.body?.exp;
    if (typeof expSec === 'number') {
      const expMs = expSec * 1000;
      if (nowMs > expMs) expired.push(session);
      return;
    }

    // Si no hay JWT, usa expirationDate (ms)
    const expMs = Number(session?.expirationDate);
    if (!Number.isNaN(expMs) && nowMs > expMs) {
      expired.push(session);
    }
  });

  return expired;
};

export const deleteExpiredSessions = () => {
  const sessions = getExpiredSessions();
  if (!Array.isArray(sessions) || sessions.length === 0) return;

  sessions.forEach((session) => {
    try {
      const index = auth.getIndex('.auth-data', session.state, 'state');
      if (index !== -1) {
        auth.delete(`.auth-data[${index}]`);
      }
    } catch (e) {
      // swallow individual errors para no inundar logs
    }
  });
};
