import db, { seedDummyClientUser } from '../server/config/database.js';

console.log('🔄 Ejecutando seedDummyClientUser()...');

setTimeout(() => {
    seedDummyClientUser();

    setTimeout(() => {
        db.get("SELECT id, nombre, email, rfc, rol, puesto, lider_id, dias_vacaciones_restantes FROM usuarios WHERE email = 'demo@rdl.com.mx'", [], (err, demoUser) => {
            if (err) {
                console.error('❌ Error buscando demo user:', err);
                process.exit(1);
            }
            console.log('✅ Usuario Demo verificado en BD:');
            console.log(JSON.stringify(demoUser, null, 2));

            if (!demoUser) {
                console.error('❌ No se encontró demoUser');
                process.exit(1);
            }

            db.all("SELECT id, titulo, peso, porcentaje_avance, estatus FROM metas_empleado WHERE usuario_id = ?", [demoUser.id], (mErr, metas) => {
                console.log(`✅ Metas asignadas (${metas.length}):`);
                console.log(JSON.stringify(metas, null, 2));

                db.all("SELECT id, titulo, mensaje, leido FROM notificaciones WHERE usuario_id = ?", [demoUser.id], (nErr, notifs) => {
                    console.log(`✅ Notificaciones (${notifs.length}):`);
                    console.log(JSON.stringify(notifs, null, 2));

                    db.all("SELECT id, usuario_nombre, tipo, subtipo, dias_solicitados, motivo, estatus, lider_id FROM incidencias_vacaciones WHERE lider_id = ?", [demoUser.id], (iErr, incs) => {
                        console.log(`✅ Incidencias por aprobar para Demo (${incs.length}):`);
                        console.log(JSON.stringify(incs, null, 2));

                        process.exit(0);
                    });
                });
            });
        });
    }, 2000);
}, 1000);
