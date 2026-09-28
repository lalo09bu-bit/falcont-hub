/**
 * RDL Intelligence Hub - Módulo de Solicitud y Aprobación de Vacaciones y Permisos de Ausencia
 * Soporta dos modalidades:
 * 1. Vacaciones (descuenta días de saldo de vacaciones)
 * 2. Permisos de Ausencia:
 *    - Permiso por HORA con y sin goce de sueldo
 *    - Permiso por DÍA con y sin goce de sueldo
 * Notifica automáticamente en tiempo real al líder directo asignado.
 */

class VacacionesModule {
    constructor() {
        this.incidencias = [];
        this.init();
    }

    init() {
        this.bindEvents();

        window.addEventListener('rdl_nueva_incidencia', (e) => {
            this.handleNuevaIncidencia(e.detail);
        });

        // Configurar fecha de hoy en campos de fecha si existen
        document.addEventListener('DOMContentLoaded', () => {
            const today = new Date().toISOString().split('T')[0];
            const fechaHora = document.getElementById('permiso-hora-fecha');
            if (fechaHora) fechaHora.value = today;
            const vacInicio = document.getElementById('vac-inicio');
            if (vacInicio) vacInicio.value = today;
            const vacFin = document.getElementById('vac-fin');
            if (vacFin) vacFin.value = today;
            const diaInicio = document.getElementById('permiso-dia-inicio');
            if (diaInicio) diaInicio.value = today;
            const diaFin = document.getElementById('permiso-dia-fin');
            if (diaFin) diaFin.value = today;
        });
    }

    bindEvents() {
        // En Astro los forms llaman directamente a submitVacaciones(event) y submitPermiso(event)
    }

    openModal() {
        const modal = document.getElementById('modal-vacaciones');
        if (!modal) return;

        modal.classList.add('active');

        const user = window.currentUser;
        if (user) {
            // Actualizar badge de saldo
            const balanceEl = document.getElementById('vac-available-days-badge');
            if (balanceEl) {
                balanceEl.textContent = `${user.dias_vacaciones_restantes ?? 0} días libres`;
            }

            // Actualizar nombre del líder objetivo en el banner
            const leaderNameEl = document.getElementById('vac-target-leader-name');
            if (leaderNameEl) {
                leaderNameEl.textContent = user.lider_nombre ? `👑 ${user.lider_nombre}` : 'Dirección General de RH';
            }
        }

        // Pestaña por defecto
        this.switchTab('vacaciones');
        this.calcVacationDays();
        this.loadIncidencias();
    }

    closeModal() {
        const modal = document.getElementById('modal-vacaciones');
        if (modal) modal.classList.remove('active');
    }

    switchTab(tab) {
        const btnVac = document.getElementById('tab-btn-vacaciones');
        const btnPerm = document.getElementById('tab-btn-permisos');
        const formVac = document.getElementById('form-solicitar-vacaciones');
        const formPerm = document.getElementById('form-solicitar-permiso');

        if (tab === 'vacaciones') {
            if (btnVac) {
                btnVac.classList.add('active', 'btn-primary');
                btnVac.classList.remove('btn-ghost');
            }
            if (btnPerm) {
                btnPerm.classList.remove('active', 'btn-primary');
                btnPerm.classList.add('btn-ghost');
            }
            if (formVac) formVac.classList.remove('hidden');
            if (formPerm) formPerm.classList.add('hidden');
            this.calcVacationDays();
        } else {
            if (btnPerm) {
                btnPerm.classList.add('active', 'btn-primary');
                btnPerm.classList.remove('btn-ghost');
            }
            if (btnVac) {
                btnVac.classList.remove('active', 'btn-primary');
                btnVac.classList.add('btn-ghost');
            }
            if (formVac) formVac.classList.add('hidden');
            if (formPerm) formPerm.classList.remove('hidden');

            const selectSubtipo = document.getElementById('permiso-subtipo');
            this.onPermisoSubtipoChange(selectSubtipo ? selectSubtipo.value : 'HORA_CON_GOCE');
        }
    }

    onPermisoSubtipoChange(subtipo) {
        const wrapHora = document.getElementById('wrapper-permiso-hora');
        const wrapDia = document.getElementById('wrapper-permiso-dia');

        if (subtipo.startsWith('HORA')) {
            if (wrapHora) wrapHora.classList.remove('hidden');
            if (wrapDia) wrapDia.classList.add('hidden');
            this.calcPermisoHours();
        } else {
            if (wrapHora) wrapHora.classList.add('hidden');
            if (wrapDia) wrapDia.classList.remove('hidden');
            this.calcPermisoDays();
        }
    }

    calcVacationDays() {
        const inicioEl = document.getElementById('vac-inicio');
        const finEl = document.getElementById('vac-fin');
        const badge = document.getElementById('vac-days-calculated-badge');
        if (!inicioEl || !finEl || !badge) return;

        const inicio = inicioEl.value;
        const fin = finEl.value;
        if (!inicio || !fin) {
            badge.innerHTML = 'Días a solicitar: <strong style="color: var(--text-main);">0 días</strong>';
            return;
        }

        const d1 = new Date(inicio + 'T00:00:00');
        const d2 = new Date(fin + 'T00:00:00');

        if (d2 < d1) {
            badge.innerHTML = '<span style="color: #ef4444; font-weight: 600;">⚠️ La fecha de fin no puede ser anterior a la de inicio</span>';
            return;
        }

        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const user = window.currentUser;
        const remaining = user ? (user.dias_vacaciones_restantes ?? 0) : 0;

        let extraWarning = '';
        if (diffDays > remaining) {
            extraWarning = ` <span style="color: #ef4444;">(Saldo insuficiente: dispones de ${remaining} días)</span>`;
        }

        badge.innerHTML = `Días a solicitar: <strong style="color: var(--accent-green-bright);">${diffDays} día${diffDays > 1 ? 's' : ''}</strong>${extraWarning}`;
    }

    calcPermisoHours() {
        const hIni = document.getElementById('permiso-hora-inicio');
        const hFin = document.getElementById('permiso-hora-fin');
        const badge = document.getElementById('permiso-hours-calculated-badge');
        if (!hIni || !hFin || !badge) return;

        const [h1, m1] = (hIni.value || '09:00').split(':').map(Number);
        const [h2, m2] = (hFin.value || '12:00').split(':').map(Number);

        let diffHours = (h2 + m2 / 60) - (h1 + m1 / 60);
        if (diffHours <= 0) {
            badge.innerHTML = '<span style="color: #ef4444; font-weight: 600;">⚠️ La hora de fin debe ser posterior a la de inicio</span>';
            return;
        }

        const formatted = diffHours.toFixed(1);
        badge.innerHTML = `Tiempo a justificar: <strong style="color: var(--accent-green-bright);">${formatted} hora${formatted !== '1.0' ? 's' : ''}</strong>`;
    }

    calcPermisoDays() {
        const inicioEl = document.getElementById('permiso-dia-inicio');
        const finEl = document.getElementById('permiso-dia-fin');
        const badge = document.getElementById('permiso-days-calculated-badge');
        if (!inicioEl || !finEl || !badge) return;

        const inicio = inicioEl.value;
        const fin = finEl.value;
        if (!inicio || !fin) {
            badge.innerHTML = 'Total de días: <strong style="color: var(--text-main);">0 días</strong>';
            return;
        }

        const d1 = new Date(inicio + 'T00:00:00');
        const d2 = new Date(fin + 'T00:00:00');

        if (d2 < d1) {
            badge.innerHTML = '<span style="color: #ef4444; font-weight: 600;">⚠️ La fecha de fin no puede ser anterior a la de inicio</span>';
            return;
        }

        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        badge.innerHTML = `Total de días: <strong style="color: var(--accent-green-bright);">${diffDays} día${diffDays > 1 ? 's' : ''}</strong>`;
    }

    async loadIncidencias() {
        try {
            const res = await fetch('/api/incidencias');
            const data = await res.json();
            if (data.success) {
                this.incidencias = data.data;
                this.renderTable();
            }
        } catch (err) {
            console.error('Error al cargar incidencias y vacaciones:', err);
        }
    }

    renderTable() {
        const tbody = document.getElementById('vacaciones-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        const user = window.currentUser || {};

        if (!this.incidencias || this.incidencias.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 20px;">No hay solicitudes registradas aún.</td></tr>';
            return;
        }

        this.incidencias.forEach(inc => {
            const tr = document.createElement('tr');

            // Permisos de aprobación: Líder directo asignado o rol de Dirección/RH
            const isLeader = inc.lider_id && user.id === inc.lider_id;
            const isPrivileged = ['RH', 'ADMIN', 'ADMIN_RH', 'ABOGADA_SR'].includes(user.rol);
            const canApprove = (isLeader || isPrivileged) && inc.estatus === 'PENDIENTE' && inc.usuario_id !== user.id;

            // Formato de Modalidad
            let modalidadBadge = '';
            if (inc.tipo === 'Vacaciones') {
                modalidadBadge = '<span class="role-badge badge-rh">🏖️ Vacaciones</span>';
            } else {
                switch (inc.subtipo) {
                    case 'HORA_CON_GOCE':
                        modalidadBadge = '<span class="role-badge badge-jr">⏱️ Hora (C/Goce)</span>';
                        break;
                    case 'HORA_SIN_GOCE':
                        modalidadBadge = '<span class="role-badge badge-sr">⏱️ Hora (S/Goce)</span>';
                        break;
                    case 'DIA_CON_GOCE':
                        modalidadBadge = '<span class="role-badge badge-jr">📅 Día (C/Goce)</span>';
                        break;
                    case 'DIA_SIN_GOCE':
                        modalidadBadge = '<span class="role-badge badge-sr">📅 Día (S/Goce)</span>';
                        break;
                    default:
                        modalidadBadge = `<span class="role-badge badge-jr">📋 ${inc.subtipo || 'Permiso'}</span>`;
                }
            }

            // Formato de Tiempo y Fechas
            let tiempoTxt = '';
            if (inc.horas_solicitadas && inc.horas_solicitadas > 0) {
                tiempoTxt = `<strong>${inc.horas_solicitadas} hrs</strong><br><span style="font-size: 0.75rem; color: var(--text-dim);">${inc.fecha_inicio} (${inc.hora_inicio || 'N/A'} - ${inc.hora_fin || 'N/A'})</span>`;
            } else {
                tiempoTxt = `<strong>${inc.dias_solicitados} día${inc.dias_solicitados > 1 ? 's' : ''}</strong><br><span style="font-size: 0.75rem; color: var(--text-dim);">${inc.fecha_inicio} al ${inc.fecha_fin}</span>`;
            }

            // Líder asignado
            const liderTxt = inc.lider_nombre ? `👑 ${inc.lider_nombre}` : '<span style="color: var(--text-dim);">RH General</span>';

            // Estatus
            let estatusBadge = '';
            if (inc.estatus === 'APROBADO') {
                estatusBadge = '<span class="role-badge badge-jr">✅ APROBADO</span>';
            } else if (inc.estatus === 'PENDIENTE') {
                estatusBadge = '<span class="role-badge badge-sr">⏳ PENDIENTE</span>';
            } else {
                estatusBadge = '<span class="role-badge badge-admin">❌ RECHAZADO</span>';
            }

            // Acciones
            let accionHtml = '';
            if (canApprove) {
                accionHtml = `
                    <div style="display: flex; gap: 4px;">
                        <button class="btn btn-sm btn-primary" onclick="vacacionesMod.aprobar(${inc.id}, 'APROBADO')" title="Aprobar Solicitud">✓</button>
                        <button class="btn btn-sm btn-ghost" style="color: #ef4444;" onclick="vacacionesMod.aprobar(${inc.id}, 'RECHAZADO')" title="Rechazar Solicitud">✕</button>
                    </div>
                `;
            } else if (inc.estatus === 'PENDIENTE') {
                accionHtml = `<span style="color: var(--text-dim); font-size: 0.75rem;">En espera</span>`;
            } else {
                accionHtml = `<span style="color: var(--text-dim); font-size: 0.72rem;">${inc.aprobado_por ? 'Por: ' + inc.aprobado_por : 'Resuelto'}</span>`;
            }

            tr.innerHTML = `
                <td>
                    <strong>${inc.usuario_nombre}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-dim);">${inc.usuario_rol}</div>
                </td>
                <td>${modalidadBadge}</td>
                <td>${tiempoTxt}</td>
                <td><small>${liderTxt}</small></td>
                <td>${estatusBadge}</td>
                <td>${accionHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async submitVacaciones(e) {
        if (e) e.preventDefault();
        const user = window.currentUser;
        if (!user) return;

        const inicio = document.getElementById('vac-inicio').value;
        const fin = document.getElementById('vac-fin').value;
        const motivo = document.getElementById('vac-motivo').value.trim();

        if (!inicio || !fin || !motivo) {
            alert('Por favor completa todos los campos para solicitar vacaciones.');
            return;
        }

        const d1 = new Date(inicio + 'T00:00:00');
        const d2 = new Date(fin + 'T00:00:00');
        if (d2 < d1) {
            alert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }

        const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        const saldo = user.dias_vacaciones_restantes ?? 0;

        if (diffDays > saldo) {
            alert(`No dispones de suficientes días libres. Tu saldo actual es de ${saldo} días.`);
            return;
        }

        const payload = {
            usuario_id: user.id,
            usuario_nombre: user.nombre,
            usuario_rol: user.rol,
            tipo: 'Vacaciones',
            subtipo: null,
            fecha_inicio: inicio,
            fecha_fin: fin,
            dias_solicitados: diffDays,
            horas_solicitadas: null,
            hora_inicio: null,
            hora_fin: null,
            motivo: motivo,
            lider_id: user.lider_id || null
        };

        try {
            const res = await fetch('/api/incidencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('form-solicitar-vacaciones').reset();
                this.calcVacationDays();
                this.loadIncidencias();
                const liderDestino = user.lider_nombre ? `tu líder directo ${user.lider_nombre}` : 'Dirección de RH';
                if (window.clientSocket) {
                    window.clientSocket.showToast(`✈️ Solicitud de vacaciones enviada a ${liderDestino}.`, 'success');
                }
            } else {
                alert(data.error || 'Error al enviar solicitud de vacaciones.');
            }
        } catch (err) {
            console.error('Error al enviar solicitud de vacaciones:', err);
            alert('Error de conexión al enviar la solicitud.');
        }
    }

    async submitPermiso(e) {
        if (e) e.preventDefault();
        const user = window.currentUser;
        if (!user) return;

        const subtipo = document.getElementById('permiso-subtipo').value;
        const motivo = document.getElementById('permiso-motivo').value.trim();

        if (!motivo) {
            alert('Por favor ingresa un motivo o justificación para el permiso.');
            return;
        }

        let payload = {
            usuario_id: user.id,
            usuario_nombre: user.nombre,
            usuario_rol: user.rol,
            tipo: 'Permiso',
            subtipo: subtipo,
            motivo: motivo,
            lider_id: user.lider_id || null
        };

        if (subtipo.startsWith('HORA')) {
            const fecha = document.getElementById('permiso-hora-fecha').value;
            const horaIni = document.getElementById('permiso-hora-inicio').value;
            const horaFin = document.getElementById('permiso-hora-fin').value;

            if (!fecha || !horaIni || !horaFin) {
                alert('Por favor completa la fecha y el horario del permiso.');
                return;
            }

            const [h1, m1] = horaIni.split(':').map(Number);
            const [h2, m2] = horaFin.split(':').map(Number);
            const diffHours = (h2 + m2 / 60) - (h1 + m1 / 60);

            if (diffHours <= 0) {
                alert('La hora de fin debe ser posterior a la hora de inicio.');
                return;
            }

            payload.fecha_inicio = fecha;
            payload.fecha_fin = fecha;
            payload.hora_inicio = horaIni;
            payload.hora_fin = horaFin;
            payload.horas_solicitadas = parseFloat(diffHours.toFixed(1));
            payload.dias_solicitados = 0;
        } else {
            const inicio = document.getElementById('permiso-dia-inicio').value;
            const fin = document.getElementById('permiso-dia-fin').value;

            if (!inicio || !fin) {
                alert('Por favor completa las fechas de inicio y fin del permiso.');
                return;
            }

            const d1 = new Date(inicio + 'T00:00:00');
            const d2 = new Date(fin + 'T00:00:00');
            if (d2 < d1) {
                alert('La fecha de fin no puede ser anterior a la fecha de inicio.');
                return;
            }

            const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;

            payload.fecha_inicio = inicio;
            payload.fecha_fin = fin;
            payload.hora_inicio = null;
            payload.hora_fin = null;
            payload.horas_solicitadas = null;
            payload.dias_solicitados = diffDays;
        }

        try {
            const res = await fetch('/api/incidencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('form-solicitar-permiso').reset();
                this.loadIncidencias();
                const liderDestino = user.lider_nombre ? `tu líder directo ${user.lider_nombre}` : 'Dirección de RH';
                if (window.clientSocket) {
                    window.clientSocket.showToast(`📩 Solicitud de permiso enviada a ${liderDestino}.`, 'success');
                }
            } else {
                alert(data.error || 'Error al enviar solicitud de permiso.');
            }
        } catch (err) {
            console.error('Error al enviar solicitud de permiso:', err);
            alert('Error de conexión al enviar la solicitud.');
        }
    }

    async aprobar(id, estatus) {
        const user = window.currentUser;
        if (!user) return;

        try {
            const res = await fetch(`/api/incidencias/${id}/aprobar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estatus,
                    aprobado_por: user.nombre,
                    rol_aprobador: user.rol,
                    usuario_id: user.id
                })
            });
            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast(`Solicitud ${estatus.toLowerCase()} con éxito.`, 'info');
                }
                this.loadIncidencias();
            } else {
                alert(data.error || 'Error al resolver la solicitud.');
            }
        } catch (err) {
            console.error('Error al aprobar/rechazar solicitud:', err);
        }
    }

    handleNuevaIncidencia(inc) {
        this.incidencias.unshift(inc);
        this.renderTable();
    }
}

window.vacacionesMod = new VacacionesModule();
