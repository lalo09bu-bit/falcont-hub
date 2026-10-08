import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';

let runtimeSecret = process.env.JWT_SECRET;
if (!runtimeSecret) {
    if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ [SEGURIDAD] JWT_SECRET no está definido en variables de entorno. Generando clave criptográfica aleatoria para esta instancia.');
    }
    // Generar clave segura única en tiempo de ejecución para evitar tokens forjados con claves públicas
    runtimeSecret = crypto.randomBytes(64).toString('hex');
}
const JWT_SECRET = runtimeSecret;
const JWT_EXPIRES_IN = '7d';

/**
 * Genera un enlace mágico criptográfico de un solo uso para un usuario.
 * - Token aleatorio de 32 bytes en formato hex (64 caracteres)
 * - Hash SHA-256 almacenado en SQLite
 * - Expiración fijada a 15 minutos en el futuro
 * 
 * @param {number|string} usuarioId ID del usuario solicitante
 * @returns {Promise<string>} Token plano (sin hashear) para enviar por correo
 */
export async function crearMagicToken(usuarioId) {
    return new Promise((resolve, reject) => {
        // 1. Genera un token aleatorio con crypto.randomBytes(32).toString('hex')
        const tokenPlano = crypto.randomBytes(32).toString('hex');

        // 2. Calcula el hash SHA-256 del token
        const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

        // 3. Inserta en auth_tokens el hash y una fecha de expiración de 15 minutos
        const query = `
            INSERT INTO auth_tokens (usuario_id, token_hash, expira_en, usado)
            VALUES (?, ?, datetime('now', '+15 minutes'), 0)
        `;

        db.run(query, [usuarioId, tokenHash], function (err) {
            if (err) {
                console.error('❌ Error al registrar token de autenticación:', err.message);
                return reject(err);
            }
            // 4. Retorna el token plano (sin hashear)
            resolve(tokenPlano);
        });
    });
}

/**
 * Valida y consume un token plano de acceso.
 * - Calcula el SHA-256
 * - Busca registro no usado y no expirado (expira_en > datetime('now'))
 * - Dentro de una transacción atómica marca usado = 1
 * - Retorna el registro del usuario asociado o null si es inválido
 * 
 * @param {string} tokenPlano Token recibido desde el enlace mágico
 * @returns {Promise<object|null>} Objeto de usuario si es válido, o null si expiró/usado/inválido
 */
export async function validarMagicToken(tokenPlano) {
    if (!tokenPlano || typeof tokenPlano !== 'string') {
        return null;
    }

    return new Promise((resolve, reject) => {
        // 1. Calcula el SHA-256 del token plano
        const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

        // 2. Busca en auth_tokens un registro donde token_hash = hash, usado = 0 y expira_en > datetime('now')
        const query = `
            SELECT t.id AS token_id, t.usuario_id, t.expira_en, t.usado,
                   u.id, u.nombre, u.email, u.rol, u.puesto, u.departamento, u.avatar, u.foto_perfil
            FROM auth_tokens t
            INNER JOIN usuarios u ON t.usuario_id = u.id
            WHERE t.token_hash = ? AND t.usado = 0 AND t.expira_en > datetime('now')
            LIMIT 1
        `;

        db.get(query, [tokenHash], (err, row) => {
            if (err) {
                console.error('❌ Error al consultar token de autenticación:', err.message);
                return reject(err);
            }

            // Si no es válido o expiró, retorna null
            if (!row) {
                return resolve(null);
            }

            // Si es válido, dentro de una transacción marca usado = 1
            db.serialize(() => {
                db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
                    if (beginErr) return reject(beginErr);
                });

                db.run('UPDATE auth_tokens SET usado = 1 WHERE id = ? AND usado = 0', [row.token_id], function (updateErr) {
                    if (updateErr) {
                        db.run('ROLLBACK');
                        return reject(updateErr);
                    }

                    // Si ningún renglón fue afectado, ya fue usado concurrentemente
                    if (this.changes === 0) {
                        db.run('ROLLBACK');
                        return resolve(null);
                    }

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return reject(commitErr);

                        // Retorna el registro de usuarios asociado (id, nombre, email, rol, puesto)
                        resolve({
                            id: row.id,
                            nombre: row.nombre,
                            email: row.email,
                            rol: row.rol,
                            puesto: row.puesto,
                            departamento: row.departamento,
                            avatar: row.avatar,
                            foto_perfil: row.foto_perfil
                        });
                    });
                });
            });
        });
    });
}

/**
 * Genera un token JWT firmado para la sesión del usuario.
 * @param {object} usuario 
 * @returns {string} Token JWT firmado
 */
export function generarJwt(usuario) {
    const payload = {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        puesto: usuario.puesto
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifica un token JWT de sesión.
 * @param {string} token 
 * @returns {object|null} Payload decodificado o null si es inválido
 */
export function verificarJwt(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

export default {
    crearMagicToken,
    validarMagicToken,
    generarJwt,
    verificarJwt
};
