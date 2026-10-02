/**
 * RDL Intelligence Hub - Servicio de Generación de Reportes y Exportadores de Base de Datos
 * Maneja el catálogo universal de parámetros, filtros de fechas y compilación de filas.
 */

export const CATALOGO_CAMPOS = [
    // 👤 1. Datos Personales & Laborales (Buk)
    { id: 'numero_empleado', label: 'No. Empleado', categoria: 'PERSONAL', type: 'string', icono: '🆔' },
    { id: 'nombre', label: 'Nombre Completo', categoria: 'PERSONAL', type: 'string', icono: '👤' },
    { id: 'rfc', label: 'RFC', categoria: 'PERSONAL', type: 'string', icono: '🏛️' },
    { id: 'email', label: 'Correo Institucional', categoria: 'PERSONAL', type: 'string', icono: '✉️' },
    { id: 'puesto', label: 'Puesto Corporativo', categoria: 'PERSONAL', type: 'string', icono: '💼' },
    { id: 'departamento', label: 'Departamento', categoria: 'PERSONAL', type: 'string', icono: '🏢' },
    { id: 'telefono', label: 'Teléfono / Contacto', categoria: 'PERSONAL', type: 'string', icono: '📞' },
    { id: 'fecha_ingreso', label: 'Fecha de Ingreso', categoria: 'PERSONAL', type: 'date', icono: '📅' },
    { id: 'antiguedad', label: 'Antigüedad', categoria: 'PERSONAL', type: 'string', icono: '⏳' },
    { id: 'tipo_contrato', label: 'Tipo de Contrato', categoria: 'PERSONAL', type: 'string', icono: '📝' },
    { id: 'estatus_laboral', label: 'Estatus Laboral', categoria: 'PERSONAL', type: 'string', icono: '🟢' },
    { id: 'lider_nombre', label: 'Líder Directo', categoria: 'PERSONAL', type: 'string', icono: '👑' },
    { id: 'salario_base', label: 'Salario Base Mensual', categoria: 'PERSONAL', type: 'currency', icono: '💵' },
    { id: 'rol', label: 'Rol en Sistema', categoria: 'PERSONAL', type: 'string', icono: '🛡️' },

    // 🏖️ 2. Vacaciones & Permisos de Ausencia
    { id: 'vac_totales', label: 'Vacaciones Asignadas (Días)', categoria: 'AUSENCIAS', type: 'number', icono: '🏖️' },
    { id: 'vac_tomados', label: 'Vacaciones Tomadas (Días)', categoria: 'AUSENCIAS', type: 'number', icono: '✈️' },
    { id: 'vac_disponibles', label: 'Vacaciones Disponibles (Días)', categoria: 'AUSENCIAS', type: 'number', icono: '✅' },
    { id: 'inc_tipo', label: 'Tipo de Ausencia', categoria: 'AUSENCIAS', type: 'string', icono: '📋' },
    { id: 'inc_subtipo', label: 'Modalidad de Permiso', categoria: 'AUSENCIAS', type: 'string', icono: '⏱️' },
    { id: 'inc_fecha_inicio', label: 'Fecha Inicio Ausencia', categoria: 'AUSENCIAS', type: 'date', icono: '📅' },
    { id: 'inc_fecha_fin', label: 'Fecha Fin Ausencia', categoria: 'AUSENCIAS', type: 'date', icono: '📅' },
    { id: 'inc_horario', label: 'Horario Solicitado', categoria: 'AUSENCIAS', type: 'string', icono: '🕒' },
    { id: 'inc_horas', label: 'Horas Justificadas', categoria: 'AUSENCIAS', type: 'number', icono: '⏱️' },
    { id: 'inc_dias', label: 'Días Justificados', categoria: 'AUSENCIAS', type: 'number', icono: '📆' },
    { id: 'inc_motivo', label: 'Motivo de Ausencia', categoria: 'AUSENCIAS', type: 'string', icono: '💬' },
    { id: 'inc_estatus', label: 'Estatus de Solicitud', categoria: 'AUSENCIAS', type: 'string', icono: '⚖️' },
    { id: 'inc_lider', label: 'Líder Aprobador', categoria: 'AUSENCIAS', type: 'string', icono: '👑' },
    { id: 'inc_fecha_solicitud', label: 'Fecha de Solicitud', categoria: 'AUSENCIAS', type: 'date', icono: '📥' },

    // 🎯 3. Metas & KPIs (Todos sus apartados)
    { id: 'meta_titulo', label: 'Título de la Meta', categoria: 'METAS', type: 'string', icono: '🎯' },
    { id: 'meta_descripcion', label: 'Descripción de la Meta', categoria: 'METAS', type: 'string', icono: '📄' },
    { id: 'meta_indicador', label: 'Métrica / Indicador', categoria: 'METAS', type: 'string', icono: '📊' },
    { id: 'meta_peso', label: 'Ponderación (Peso %)', categoria: 'METAS', type: 'number', icono: '⚖️' },
    { id: 'meta_avance', label: 'Avance Real (%)', categoria: 'METAS', type: 'number', icono: '📈' },
    { id: 'meta_categoria', label: 'Categoría de Meta', categoria: 'METAS', type: 'string', icono: '🏷️' },
    { id: 'meta_fecha_limite', label: 'Fecha Límite', categoria: 'METAS', type: 'date', icono: '⏰' },
    { id: 'meta_estatus', label: 'Estatus de la Meta', categoria: 'METAS', type: 'string', icono: '📌' },
    { id: 'meta_fecha_creacion', label: 'Fecha de Asignación', categoria: 'METAS', type: 'date', icono: '📆' }
];

// Calcular antigüedad textual amigable
function calcularAntiguedad(fechaIngreso) {
    if (!fechaIngreso) return 'No registrada';
    const fi = new Date(fechaIngreso);
    if (isNaN(fi.getTime())) return 'No registrada';
    const hoy = new Date();
    let meses = (hoy.getFullYear() - fi.getFullYear()) * 12 + (hoy.getMonth() - fi.getMonth());
    if (meses < 0) meses = 0;
    if (meses >= 12) {
        const anios = Math.floor(meses / 12);
        const rem = meses % 12;
        return `${anios} ${anios === 1 ? 'año' : 'años'}${rem > 0 ? ` y ${rem} m` : ''}`;
    } else if (meses > 0) {
        return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    }
    return 'Menos de 1 mes';
}

// Formatear modalidad de subtipo
function formatSubtipo(tipo, subtipo) {
    if (tipo === 'Vacaciones') return 'Periodo Vacacional';
    switch (subtipo) {
        case 'HORA_CON_GOCE': return 'Permiso por Hora (Con Goce)';
        case 'HORA_SIN_GOCE': return 'Permiso por Hora (Sin Goce)';
        case 'DIA_CON_GOCE': return 'Permiso por Día (Con Goce)';
        case 'DIA_SIN_GOCE': return 'Permiso por Día (Sin Goce)';
        default: return subtipo || tipo || 'Permiso Especial';
    }
}

/**
 * Consulta la base de datos y construye el arreglo de filas correspondiente
 * a los campos seleccionados y rango de fechas.
 */
export async function buildReportDataset(db, { campos = [], fecha_desde = null, fecha_hasta = null, limite = null }) {
    // Si no se pasaron campos, usar campos principales por defecto
    const activeFieldIds = Array.isArray(campos) && campos.length > 0
        ? campos
        : ['numero_empleado', 'nombre', 'rfc', 'email', 'puesto', 'departamento', 'fecha_ingreso', 'estatus_laboral'];

    const columnDefs = activeFieldIds
        .map(fid => CATALOGO_CAMPOS.find(c => c.id === fid))
        .filter(Boolean);

    const hasIncidenciaRecords = columnDefs.some(c => c.id.startsWith('inc_'));
    const hasSaldosVacaciones = columnDefs.some(c => c.id.startsWith('vac_'));
    const hasMetas = columnDefs.some(c => c.categoria === 'METAS');

    // 1. Obtener todos los colaboradores con su líder directo
    const usuarios = await new Promise((resolve, reject) => {
        const sql = `
            SELECT u.*, l.nombre as lider_nombre_calc
            FROM usuarios u
            LEFT JOIN usuarios l ON u.lider_id = l.id
            ORDER BY u.id ASC
        `;
        db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    // 2. Obtener Incidencias si se requieren registros de incidencias o saldos
    let incidencias = [];
    if (hasIncidenciaRecords || hasSaldosVacaciones) {
        incidencias = await new Promise((resolve, reject) => {
            let sql = `
                SELECT i.*, l.nombre as lider_nombre_inc
                FROM incidencias_vacaciones i
                LEFT JOIN usuarios l ON i.lider_id = l.id
                WHERE 1=1
            `;
            const params = [];
            if (fecha_desde) {
                sql += ` AND (i.fecha_inicio >= ? OR (i.fecha_solicitud IS NOT NULL AND SUBSTR(i.fecha_solicitud, 1, 10) >= ?))`;
                params.push(fecha_desde, fecha_desde);
            }
            if (fecha_hasta) {
                sql += ` AND (i.fecha_inicio <= ? OR (i.fecha_solicitud IS NOT NULL AND SUBSTR(i.fecha_solicitud, 1, 10) <= ?))`;
                params.push(fecha_hasta, fecha_hasta);
            }
            sql += ` ORDER BY i.id DESC`;
            db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
        });
    }

    // 3. Obtener Metas si se requieren
    let metas = [];
    if (hasMetas) {
        metas = await new Promise((resolve, reject) => {
            let sql = `
                SELECT m.*
                FROM metas_empleado m
                WHERE 1=1
            `;
            const params = [];
            if (fecha_desde) {
                sql += ` AND (m.fecha_creacion >= ? OR m.fecha_limite >= ?)`;
                params.push(fecha_desde, fecha_desde);
            }
            if (fecha_hasta) {
                sql += ` AND (m.fecha_creacion <= ? OR m.fecha_limite <= ?)`;
                params.push(fecha_hasta, fecha_hasta);
            }
            sql += ` ORDER BY m.usuario_id ASC, m.id ASC`;
            db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
        });
    }

    // Mapeador de fila según usuario, incidencia y meta
    const buildRow = (u, inc = null, meta = null) => {
        const row = {};
        const saldoRestante = (u.dias_vacaciones_totales || 0) - (u.dias_vacaciones_tomados || 0);

        columnDefs.forEach(col => {
            switch (col.id) {
                // Personal
                case 'numero_empleado': row[col.id] = u.numero_empleado || 'N/A'; break;
                case 'nombre': row[col.id] = u.nombre || ''; break;
                case 'rfc': row[col.id] = u.rfc || 'No registrado'; break;
                case 'email': row[col.id] = u.email || ''; break;
                case 'puesto': row[col.id] = u.puesto || ''; break;
                case 'departamento': row[col.id] = u.departamento || ''; break;
                case 'telefono': row[col.id] = u.telefono || ''; break;
                case 'fecha_ingreso': row[col.id] = u.fecha_ingreso || ''; break;
                case 'antiguedad': row[col.id] = calcularAntiguedad(u.fecha_ingreso); break;
                case 'tipo_contrato': row[col.id] = u.tipo_contrato || 'Tiempo Indeterminado'; break;
                case 'estatus_laboral': row[col.id] = u.estatus_laboral || 'Activo'; break;
                case 'lider_nombre': row[col.id] = u.lider_nombre_calc || 'Dirección de RH'; break;
                case 'salario_base': row[col.id] = u.salario_base ? parseFloat(u.salario_base) : null; break;
                case 'rol': row[col.id] = u.rol || ''; break;

                // Vacaciones & Ausencias
                case 'vac_totales': row[col.id] = u.dias_vacaciones_totales || 0; break;
                case 'vac_tomados': row[col.id] = u.dias_vacaciones_tomados || 0; break;
                case 'vac_disponibles': row[col.id] = saldoRestante; break;
                case 'inc_tipo': row[col.id] = inc ? inc.tipo : '-'; break;
                case 'inc_subtipo': row[col.id] = inc ? formatSubtipo(inc.tipo, inc.subtipo) : '-'; break;
                case 'inc_fecha_inicio': row[col.id] = inc ? inc.fecha_inicio : '-'; break;
                case 'inc_fecha_fin': row[col.id] = inc ? inc.fecha_fin : '-'; break;
                case 'inc_horario': 
                    row[col.id] = (inc && inc.hora_inicio && inc.hora_fin) 
                        ? `${inc.hora_inicio} a ${inc.hora_fin}` 
                        : (inc ? (inc.subtipo && inc.subtipo.startsWith('HORA') ? (inc.hora_inicio || 'Horario por horas') : 'Jornada Completa') : '-'); 
                    break;
                case 'inc_horas': 
                    row[col.id] = inc && inc.horas_solicitadas !== null && inc.horas_solicitadas !== undefined && inc.horas_solicitadas > 0
                        ? parseFloat(inc.horas_solicitadas) 
                        : (inc && inc.subtipo && inc.subtipo.startsWith('HORA') ? 0 : '-'); 
                    break;
                case 'inc_dias': 
                    row[col.id] = inc && inc.dias_solicitados !== null && inc.dias_solicitados !== undefined 
                        ? parseFloat(inc.dias_solicitados) 
                        : (inc ? 1 : '-'); 
                    break;
                case 'inc_motivo': row[col.id] = inc ? (inc.motivo || '') : '-'; break;
                case 'inc_estatus': row[col.id] = inc ? (inc.estatus || 'PENDIENTE') : '-'; break;
                case 'inc_lider': row[col.id] = inc ? (inc.aprobado_por || inc.lider_nombre_inc || 'Dirección RH') : '-'; break;
                case 'inc_fecha_solicitud': 
                    row[col.id] = inc && inc.fecha_solicitud ? inc.fecha_solicitud.substring(0, 10) : '-'; 
                    break;

                // Metas & KPIs
                case 'meta_titulo': row[col.id] = meta ? meta.titulo : '-'; break;
                case 'meta_descripcion': row[col.id] = meta ? (meta.descripcion || '') : '-'; break;
                case 'meta_indicador': row[col.id] = meta ? (meta.indicador || '') : '-'; break;
                case 'meta_peso': row[col.id] = meta && meta.peso ? parseFloat(meta.peso) : 0; break;
                case 'meta_avance': row[col.id] = meta && meta.porcentaje_avance ? parseFloat(meta.porcentaje_avance) : 0; break;
                case 'meta_categoria': row[col.id] = meta ? meta.categoria : '-'; break;
                case 'meta_fecha_limite': row[col.id] = meta ? meta.fecha_limite : '-'; break;
                case 'meta_estatus': row[col.id] = meta ? meta.estatus : '-'; break;
                case 'meta_fecha_creacion': 
                    row[col.id] = meta && meta.fecha_creacion ? meta.fecha_creacion.substring(0, 10) : '-'; 
                    break;

                default: row[col.id] = '';
            }
        });

        return row;
    };

    let dataset = [];

    // CASO A: Reporte enfocado en registros individuales de incidencias y ausencias
    if (hasIncidenciaRecords && !hasMetas) {
        if (incidencias.length === 0) {
            dataset = [];
        } else {
            dataset = incidencias.map(inc => {
                const u = usuarios.find(usr => String(usr.id) === String(inc.usuario_id)) || {
                    id: inc.usuario_id,
                    nombre: inc.usuario_nombre || 'Colaborador',
                    rol: inc.usuario_rol || 'CONTADOR_JR',
                    rfc: 'No registrado',
                    puesto: 'Auditor Junior',
                    departamento: 'Fiscal & Contabilidad'
                };
                return buildRow(u, inc, null);
            });
        }
    } 
    // CASO B: Reporte enfocado en metas & KPIs
    else if (hasMetas && !hasIncidenciaRecords) {
        if (metas.length === 0) {
            dataset = [];
        } else {
            dataset = metas.map(meta => {
                const u = usuarios.find(usr => String(usr.id) === String(meta.usuario_id)) || {
                    id: meta.usuario_id,
                    nombre: 'Colaborador',
                    rol: 'CONTADOR_JR'
                };
                return buildRow(u, null, meta);
            });
        }
    }
    // CASO C: Consolidado (Tanto incidencias como metas)
    else if (hasMetas && hasIncidenciaRecords) {
        usuarios.forEach(u => {
            const userIncs = incidencias.filter(i => String(i.usuario_id) === String(u.id));
            const userMetas = metas.filter(m => String(m.usuario_id) === String(u.id));
            const maxLen = Math.max(userIncs.length, userMetas.length, 1);

            for (let i = 0; i < maxLen; i++) {
                dataset.push(buildRow(u, userIncs[i] || null, userMetas[i] || null));
            }
        });
    }
    // CASO D: Colaboradores, saldo de vacaciones y datos de personal (sin duplicar colaboradores)
    else {
        let filteredUsers = usuarios;
        if (fecha_desde) {
            filteredUsers = filteredUsers.filter(u => !u.fecha_ingreso || u.fecha_ingreso >= fecha_desde);
        }
        if (fecha_hasta) {
            filteredUsers = filteredUsers.filter(u => !u.fecha_ingreso || u.fecha_ingreso <= fecha_hasta);
        }
        dataset = filteredUsers.map(u => buildRow(u, null, null));
    }

    if (limite && Number.isInteger(limite) && limite > 0) {
        dataset = dataset.slice(0, limite);
    }

    return {
        columns: columnDefs,
        rows: dataset,
        total: dataset.length
    };
}
