/**
 * RDL Intelligence Hub - Módulo de Ficha de Colaborador (Estilo Buk)
 * Ficha de perfil completa con foto de perfil, datos generales/laborales,
 * asignación de metas ponderadas (100%), KPIs y vacaciones.
 */

class PerfilModule {
    constructor() {
        this.currentUserId = null;
        this.userData = null;
        this.currentTab = 'general';
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            // Configurar selector de foto de perfil
            const photoInput = document.getElementById('buk-photo-input');
            const photoUploadTrigger = document.getElementById('buk-photo-upload-trigger');
            const avatarDropZone = document.getElementById('buk-avatar-dropzone');

            if (photoUploadTrigger && photoInput) {
                photoUploadTrigger.addEventListener('click', () => photoInput.click());
            }

            if (photoInput) {
                photoInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.uploadProfilePhoto(file);
                    }
                });
            }

            // Drag & drop para foto de perfil
            if (avatarDropZone) {
                avatarDropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    avatarDropZone.classList.add('drag-active');
                });
                avatarDropZone.addEventListener('dragleave', () => {
                    avatarDropZone.classList.remove('drag-active');
                });
                avatarDropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    avatarDropZone.classList.remove('drag-active');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        this.uploadProfilePhoto(file);
                    }
                });
            }

            // Formulario de edición de datos generales
            const formEditData = document.getElementById('form-edit-buk-profile');
            if (formEditData) {
                formEditData.addEventListener('submit', (e) => this.handleSaveGeneralData(e));
            }

            // Formulario de asignación de metas dentro del perfil Buk
            const formAddMeta = document.getElementById('form-buk-add-meta');
            if (formAddMeta) {
                formAddMeta.addEventListener('submit', (e) => this.handleAddMetaInProfile(e));
            }
        });

        // Escuchar actualizaciones remotas vía WebSocket
        window.addEventListener('rdl_metas_actualizadas', (e) => {
            const detail = e.detail;
            if (this.isModalOpen() && this.currentUserId === detail.usuario_id) {
                this.loadProfileData(this.currentUserId);
            }
        });

        window.addEventListener('rdl_perfil_actualizado', (e) => {
            const updatedUser = e.detail;
            if (this.isModalOpen() && this.currentUserId === updatedUser.id) {
                this.loadProfileData(this.currentUserId);
            }
        });

        window.addEventListener('rdl_vacaciones_actualizadas', (e) => {
            const updatedUser = e.detail;
            if (this.isModalOpen() && this.currentUserId === updatedUser.id) {
                this.loadProfileData(this.currentUserId);
            }
        });
    }

    isModalOpen() {
        const modal = document.getElementById('modal-perfil-colaborador');
        return modal && modal.classList.contains('active');
    }

    async openProfile(userId) {
        this.currentUserId = parseInt(userId, 10);
        const modal = document.getElementById('modal-perfil-colaborador');
        if (!modal) return;

        modal.classList.add('active');
        this.switchBukTab('general'); // Resetear a la pestaña general por defecto

        await this.loadProfileData(this.currentUserId);
    }

    closeProfile() {
        const modal = document.getElementById('modal-perfil-colaborador');
        if (modal) modal.classList.remove('active');
        this.currentUserId = null;
        this.userData = null;
    }

    async loadProfileData(userId) {
        try {
            const res = await fetch(`/api/colaboradores/${userId}`);
            const data = await res.json();

            if (data.success && data.data) {
                this.userData = data.data;
                this.renderBukProfile(data.data);
            }
        } catch (err) {
            console.error('Error cargando ficha Buk del colaborador:', err);
        }
    }

    renderBukProfile(data) {
        const { perfil, metas, stats, incidencias } = data;

        // 1. Header de Ficha Buk
        const nameEl = document.getElementById('buk-emp-name');
        const puestoEl = document.getElementById('buk-emp-puesto');
        const deptEl = document.getElementById('buk-emp-dept');
        const roleBadgeEl = document.getElementById('buk-emp-role-badge');
        const statusPillEl = document.getElementById('buk-emp-status-pill');
        const numEmpEl = document.getElementById('buk-emp-id-badge');

        if (nameEl) nameEl.textContent = perfil.nombre;
        if (puestoEl) puestoEl.textContent = perfil.puesto;
        if (deptEl) deptEl.textContent = perfil.departamento || 'Departamento Legal RDL';
        if (numEmpEl) numEmpEl.textContent = perfil.numero_empleado ? `ID: ${perfil.numero_empleado}` : 'ID: RDL-000';

        // Badge de Rol
        if (roleBadgeEl) {
            let roleClass = 'badge-jr';
            let roleLabel = 'Abogada JR';
            if (perfil.rol === 'RH' || perfil.rol === 'ADMIN_RH') { roleClass = 'badge-rh'; roleLabel = 'Recursos Humanos (RH)'; }
            else if (perfil.rol === 'ADMIN') { roleClass = 'badge-admin'; roleLabel = 'Administrador'; }
            else if (perfil.rol === 'ABOGADA_SR') { roleClass = 'badge-sr'; roleLabel = 'Abogada SR'; }
            roleBadgeEl.className = `role-badge ${roleClass}`;
            roleBadgeEl.textContent = roleLabel;
        }

        // Pill de Estatus Laboral
        if (statusPillEl) {
            const status = perfil.estatus_laboral || 'Activo';
            statusPillEl.textContent = status === 'Activo' ? '🟢 Activo' : `🏖️ ${status}`;
            statusPillEl.className = `buk-status-pill ${status === 'Activo' ? 'status-active' : 'status-leave'}`;
        }

        // Renderizar Foto de Perfil / Avatar
        const avatarContainer = document.getElementById('buk-avatar-display');
        if (avatarContainer) {
            if (perfil.foto_perfil) {
                avatarContainer.innerHTML = `<img src="${perfil.foto_perfil}" alt="${perfil.nombre}" class="buk-avatar-photo-img">`;
            } else {
                const initials = perfil.avatar || perfil.nombre.substring(0, 2).toUpperCase();
                avatarContainer.innerHTML = `<div class="buk-avatar-photo-initials">${initials}</div>`;
            }
        }

        // 2. Tab 1: Renderizar Datos Generales y Laborales (Estilo Buk)
        this.renderGeneralDataTab(perfil);

        // 3. Tab 2: Renderizar Metas Ponderadas (100%) y Formulario para Admin
        this.renderMetasTab(metas || [], stats || {});

        // 4. Tab 3: Renderizar Vacaciones e Incidencias
        this.renderVacacionesTab(perfil, incidencias || []);

        // Visibilidad de controles para Administradores y RH
        const adminControls = document.querySelectorAll('.buk-admin-only');
        const isSupervisor = window.currentUser && (window.currentUser.rol === 'ADMIN' || window.currentUser.rol === 'ABOGADA_SR' || window.currentUser.rol === 'RH' || window.currentUser.rol === 'ADMIN_RH');
        adminControls.forEach(el => {
            if (isSupervisor) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }

    renderGeneralDataTab(perfil) {
        const container = document.getElementById('buk-tab-general-content');
        if (!container) return;

        // Calcular Antigüedad
        let antiguedadTxt = 'Reciente ingreso';
        if (perfil.fecha_ingreso) {
            const fechaIng = new Date(perfil.fecha_ingreso);
            const hoy = new Date();
            const meses = (hoy.getFullYear() - fechaIng.getFullYear()) * 12 + (hoy.getMonth() - fechaIng.getMonth());
            if (meses >= 12) {
                const anios = Math.floor(meses / 12);
                const remMeses = meses % 12;
                antiguedadTxt = `${anios} ${anios === 1 ? 'año' : 'años'}${remMeses > 0 ? ` y ${remMeses} meses` : ''}`;
            } else if (meses > 0) {
                antiguedadTxt = `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
            } else {
                antiguedadTxt = 'Menos de 1 mes';
            }
        }

        container.innerHTML = `
            <div class="buk-details-grid">
                <div class="buk-detail-card">
                    <span class="buk-detail-label">👤 Nombre Completo</span>
                    <span class="buk-detail-val">${perfil.nombre}</span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">💼 Puesto Corporativo</span>
                    <span class="buk-detail-val">${perfil.puesto}</span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">🏢 Departamento</span>
                    <span class="buk-detail-val">${perfil.departamento || 'Legal & Talent'}</span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">🆔 No. de Empleado</span>
                    <span class="buk-detail-val"><code>${perfil.numero_empleado || 'RDL-000'}</code></span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">🏛️ RFC</span>
                    <span class="buk-detail-val"><strong style="font-family: monospace; letter-spacing: 0.5px; color: var(--accent-green-bright);">${perfil.rfc || 'No registrado'}</strong></span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">✉️ Correo Electrónico</span>
                    <span class="buk-detail-val"><a href="mailto:${perfil.email}" style="color: var(--accent-green-bright); text-decoration: none;">${perfil.email}</a></span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">📞 Teléfono / Contacto</span>
                    <span class="buk-detail-val">${perfil.telefono || '+52 (55) 5482-9000'}</span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">📅 Fecha de Ingreso</span>
                    <span class="buk-detail-val">${perfil.fecha_ingreso || '2026-01-15'} <small style="color: var(--text-dim);">(${antiguedadTxt})</small></span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">📝 Tipo de Contrato</span>
                    <span class="buk-detail-val">${perfil.tipo_contrato || 'Tiempo Indeterminado'}</span>
                </div>
                <div class="buk-detail-card">
                    <span class="buk-detail-label">🟢 Estatus Laboral</span>
                    <span class="buk-detail-val">${perfil.estatus_laboral || 'Activo'}</span>
                </div>
            </div>
        `;
    }

    renderMetasTab(metas, stats) {
        // 1. Balance de Pesos & Desempeño
        const sumaPesos = stats.suma_pesos || 0;
        const scoreGlobal = stats.avance_ponderado_global || 0;

        const weightBadge = document.getElementById('buk-meta-weight-badge');
        const weightBar = document.getElementById('buk-meta-weight-bar');
        const weightFeedback = document.getElementById('buk-meta-weight-feedback');
        const scoreNumber = document.getElementById('buk-meta-overall-score');

        if (weightBadge) weightBadge.textContent = `${sumaPesos}% / 100%`;
        if (scoreNumber) scoreNumber.textContent = `${scoreGlobal}%`;

        if (weightBar) {
            weightBar.style.width = `${Math.min(100, sumaPesos)}%`;
            if (stats.ponderacion_completa || Math.abs(sumaPesos - 100) < 0.5) {
                weightBar.style.background = 'linear-gradient(90deg, #10b981, #00e676)';
                if (weightBadge) {
                    weightBadge.className = 'badge-weight-ok';
                    weightBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                    weightBadge.style.color = 'var(--accent-green-bright)';
                }
                if (weightFeedback) weightFeedback.innerHTML = '✅ <span style="color: var(--accent-green-bright); font-weight: 600;">Ponderación completa (100%)</span>';
            } else if (sumaPesos < 100) {
                const faltante = Math.round((100 - sumaPesos) * 100) / 100;
                weightBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
                if (weightBadge) {
                    weightBadge.className = 'badge-weight-warn';
                    weightBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                    weightBadge.style.color = '#fbbf24';
                }
                if (weightFeedback) weightFeedback.innerHTML = `⚠️ <span style="color: #fbbf24;">Faltan ${faltante}% para completar el 100% de ponderación</span>`;
            } else {
                const exceso = Math.round((sumaPesos - 100) * 100) / 100;
                weightBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
                if (weightBadge) {
                    weightBadge.className = 'badge-weight-err';
                    weightBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                    weightBadge.style.color = '#f87171';
                }
                if (weightFeedback) weightFeedback.innerHTML = `🚨 <span style="color: #f87171;">Excede por ${exceso}% (Total: ${sumaPesos}%). Ajusta los pesos.</span>`;
            }
        }

        // 2. Lista de Metas Asignadas
        const listContainer = document.getElementById('buk-metas-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        if (metas.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--text-dim); background: rgba(7, 13, 25, 0.5); border-radius: var(--radius-md);">
                    <span>🎯</span>
                    <p style="margin-top: 6px; font-size: 0.85rem;">Esta colaboradora aún no tiene metas ni KPIs asignados.</p>
                    <small>Usa el formulario inferior para asignar una meta con su indicador y peso correspondiente.</small>
                </div>
            `;
            return;
        }

        const isSupervisor = window.currentUser && (window.currentUser.rol === 'ADMIN' || window.currentUser.rol === 'ABOGADA_SR' || window.currentUser.rol === 'RH' || window.currentUser.rol === 'ADMIN_RH');

        metas.forEach(meta => {
            const item = document.createElement('div');
            item.className = 'buk-meta-card floating-element';

            let catColor = '#60a5fa';
            if (meta.categoria === 'Desempeño') catColor = '#34d399';
            else if (meta.categoria === 'Capacitación') catColor = '#fbbf24';
            else if (meta.categoria === 'OKR') catColor = '#c084fc';

            const statusBadge = meta.porcentaje_avance >= 100 
                ? '<span class="status-pill status-completed">✅ Completada</span>'
                : meta.porcentaje_avance > 0 
                    ? '<span class="status-pill status-progress">⏳ En Progreso</span>'
                    : '<span class="status-pill status-pending">⚪ Por Iniciar</span>';

            const deleteBtn = isSupervisor ? `
                <button class="btn btn-ghost btn-sm" style="color: #f87171; padding: 4px 8px;" onclick="perfilMod.handleDeleteMeta(${meta.id})" title="Eliminar Meta">
                    🗑️
                </button>
            ` : '';

            item.innerHTML = `
                <div class="buk-meta-header">
                    <div>
                        <span class="meta-cat-pill" style="color: ${catColor}; border-color: ${catColor}44; background: ${catColor}15;">${meta.categoria || 'Caso Legal'}</span>
                        <h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 4px;">${meta.titulo}</h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="meta-weight-badge">⚖️ Peso: <strong>${meta.peso}%</strong></span>
                        ${deleteBtn}
                    </div>
                </div>

                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px;">${meta.descripcion || ''}</p>

                <!-- Indicador Tangible / KPI -->
                <div class="meta-kpi-chip" style="margin-bottom: 10px;">
                    <span class="kpi-icon">🎯</span>
                    <span class="kpi-text"><strong>Indicador:</strong> ${meta.indicador || 'Cumplimiento de objetivos'}</span>
                </div>

                <!-- Barra de Avance -->
                <div class="meta-progress-section">
                    <div class="meta-progress-labels">
                        <span>Avance Reportado:</span>
                        <strong id="buk-meta-pct-${meta.id}" style="color: var(--accent-green-bright);">${meta.porcentaje_avance}%</strong>
                    </div>
                    <div class="meta-progress-bar">
                        <div class="meta-progress-fill" id="buk-meta-fill-${meta.id}" style="width: ${meta.porcentaje_avance}%;"></div>
                    </div>
                </div>

                <!-- Slider interactivo de avance -->
                <div class="meta-slider-row">
                    <label style="font-size: 0.72rem; color: var(--text-dim);">Ajustar Avance:</label>
                    <input type="range" min="0" max="100" step="5" value="${meta.porcentaje_avance}" 
                        class="meta-slider" 
                        oninput="perfilMod.onSliderInput(${meta.id}, this.value)"
                        onchange="perfilMod.onSliderChange(${meta.id}, this.value)">
                </div>

                <div class="meta-item-footer">
                    <span style="font-size: 0.72rem; color: var(--text-dim);">📅 Límite: ${meta.fecha_limite || '2026-12-31'}</span>
                    ${statusBadge}
                </div>
            `;

            listContainer.appendChild(item);
        });
    }

    onSliderInput(metaId, value) {
        const valEl = document.getElementById(`buk-meta-pct-${metaId}`);
        const fillEl = document.getElementById(`buk-meta-fill-${metaId}`);
        if (valEl) valEl.textContent = `${value}%`;
        if (fillEl) fillEl.style.width = `${value}%`;
    }

    async onSliderChange(metaId, value) {
        try {
            const res = await fetch(`/api/metas/${metaId}/avance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ porcentaje_avance: parseFloat(value) })
            });
            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast('Progreso de meta actualizado.', 'success');
                }
                if (this.currentUserId) {
                    this.loadProfileData(this.currentUserId);
                }
            }
        } catch (err) {
            console.error('Error al actualizar avance de meta:', err);
        }
    }

    async handleAddMetaInProfile(e) {
        e.preventDefault();
        if (!this.currentUserId) return;

        const titulo = document.getElementById('buk-new-meta-titulo').value.trim();
        const descripcion = document.getElementById('buk-new-meta-descripcion').value.trim();
        const indicador = document.getElementById('buk-new-meta-indicador').value.trim();
        const categoria = document.getElementById('buk-new-meta-categoria').value;
        const peso = parseFloat(document.getElementById('buk-new-meta-peso').value) || 25;
        const porcentaje_avance = parseFloat(document.getElementById('buk-new-meta-avance').value) || 0;
        const fecha_limite = document.getElementById('buk-new-meta-fecha').value || '2026-12-31';

        try {
            const res = await fetch('/api/metas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usuario_id: this.currentUserId,
                    titulo,
                    descripcion,
                    indicador,
                    categoria,
                    peso,
                    porcentaje_avance,
                    fecha_limite
                })
            });

            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast(`Meta asignada a ${this.userData.perfil.nombre}.`, 'success');
                }
                e.target.reset();
                this.loadProfileData(this.currentUserId);
            } else {
                alert(data.error || 'Error al asignar meta.');
            }
        } catch (err) {
            console.error('Error al agregar meta en perfil:', err);
        }
    }

    async handleDeleteMeta(metaId) {
        if (!confirm('¿Estás segura de eliminar esta meta del perfil? Se recalculará la ponderación del 100%.')) return;

        try {
            const res = await fetch(`/api/metas/${metaId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast('Meta eliminada del perfil.', 'success');
                }
                if (this.currentUserId) {
                    this.loadProfileData(this.currentUserId);
                }
            }
        } catch (err) {
            console.error('Error al eliminar meta en perfil:', err);
        }
    }

    renderVacacionesTab(perfil, incidencias) {
        const remainingEl = document.getElementById('buk-vac-remaining');
        const totalEl = document.getElementById('buk-vac-total');
        const takenEl = document.getElementById('buk-vac-taken');
        const tbody = document.getElementById('buk-vacaciones-table-body');

        if (remainingEl) remainingEl.textContent = perfil.dias_vacaciones_restantes !== undefined ? perfil.dias_vacaciones_restantes : 10;
        if (totalEl) totalEl.textContent = perfil.dias_vacaciones_totales || 12;
        if (takenEl) takenEl.textContent = perfil.dias_vacaciones_tomados || 0;

        if (!tbody) return;
        tbody.innerHTML = '';

        if (incidencias.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 18px;">No hay solicitudes registradas para este perfil.</td></tr>';
            return;
        }

        incidencias.forEach(inc => {
            const tr = document.createElement('tr');
            let statusBadge = '<span class="status-pill status-pending">Pendiente</span>';
            if (inc.estatus === 'APROBADO') statusBadge = '<span class="status-pill status-completed">Aprobado</span>';
            else if (inc.estatus === 'RECHAZADO') statusBadge = '<span class="status-pill badge-weight-err">Rechazado</span>';

            tr.innerHTML = `
                <td><strong>${inc.tipo}</strong></td>
                <td>${inc.fecha_inicio} al ${inc.fecha_fin}</td>
                <td style="text-align: center;"><strong>${inc.dias_solicitados}</strong></td>
                <td>${inc.motivo || 'Sin motivo especificado'}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    switchBukTab(tabName) {
        this.currentTab = tabName;

        const tabs = ['general', 'metas', 'vacaciones'];
        tabs.forEach(t => {
            const btn = document.getElementById(`buk-tab-btn-${t}`);
            const content = document.getElementById(`buk-tab-pane-${t}`);

            if (t === tabName) {
                if (btn) btn.classList.add('active');
                if (content) content.classList.remove('hidden');
            } else {
                if (btn) btn.classList.remove('active');
                if (content) content.classList.add('hidden');
            }
        });
    }

    async uploadProfilePhoto(file) {
        if (!this.currentUserId) return;

        // Validar que sea imagen y tamaño razonable (< 15MB)
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona un archivo de imagen válido (PNG, JPG, JPEG, WEBP).');
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            alert('La imagen seleccionada es demasiado pesada (máximo 15MB).');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result;

            try {
                const res = await fetch(`/api/colaboradores/${this.currentUserId}/foto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ foto_perfil: base64Data })
                });

                const data = await res.json();
                if (data.success) {
                    if (window.clientSocket) {
                        window.clientSocket.showToast('¡Foto de perfil actualizada con éxito!', 'success');
                    }

                    // Recargar datos en la ficha Buk
                    this.loadProfileData(this.currentUserId);

                    // Si el perfil actualizado es el usuario logueado, actualizar ficha principal
                    if (window.currentUser && window.currentUser.id === this.currentUserId) {
                        window.currentUser.foto_perfil = base64Data;
                        if (window.empleadoMod) {
                            window.empleadoMod.renderProfile(window.currentUser);
                        }
                    }
                } else {
                    alert(data.error || 'Error al guardar la foto de perfil.');
                }
            } catch (err) {
                console.error('Error al subir foto de perfil:', err);
            }
        };

        reader.readAsDataURL(file);
    }

    openEditGeneralDataModal() {
        if (!this.userData || !this.userData.perfil) return;
        const p = this.userData.perfil;

        document.getElementById('edit-buk-nombre').value = p.nombre || '';
        document.getElementById('edit-buk-puesto').value = p.puesto || '';
        document.getElementById('edit-buk-departamento').value = p.departamento || 'Departamento Legal RDL';
        const rfcEl = document.getElementById('edit-buk-rfc');
        if (rfcEl) rfcEl.value = p.rfc || '';
        document.getElementById('edit-buk-telefono').value = p.telefono || '';
        document.getElementById('edit-buk-fecha-ingreso').value = p.fecha_ingreso || '2026-01-15';
        document.getElementById('edit-buk-tipo-contrato').value = p.tipo_contrato || 'Tiempo Indeterminado';
        document.getElementById('edit-buk-numero-empleado').value = p.numero_empleado || '';
        document.getElementById('edit-buk-salario-base').value = p.salario_base || '';
        document.getElementById('edit-buk-estatus-laboral').value = p.estatus_laboral || 'Activo';

        document.getElementById('modal-editar-perfil-datos').classList.add('active');
    }

    closeEditGeneralDataModal() {
        const modal = document.getElementById('modal-editar-perfil-datos');
        if (modal) modal.classList.remove('active');
    }

    async handleSaveGeneralData(e) {
        e.preventDefault();
        if (!this.currentUserId) return;

        const nombre = document.getElementById('edit-buk-nombre').value.trim();
        const puesto = document.getElementById('edit-buk-puesto').value.trim();
        const departamento = document.getElementById('edit-buk-departamento').value.trim();
        const rfcEl = document.getElementById('edit-buk-rfc');
        const rfc = rfcEl ? rfcEl.value.trim().toUpperCase() : '';
        const telefono = document.getElementById('edit-buk-telefono').value.trim();
        const fecha_ingreso = document.getElementById('edit-buk-fecha-ingreso').value;
        const tipo_contrato = document.getElementById('edit-buk-tipo-contrato').value;
        const numero_empleado = document.getElementById('edit-buk-numero-empleado').value.trim();
        const salario_base = parseFloat(document.getElementById('edit-buk-salario-base').value) || null;
        const estatus_laboral = document.getElementById('edit-buk-estatus-laboral').value;

        try {
            const res = await fetch(`/api/colaboradores/${this.currentUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre,
                    puesto,
                    departamento,
                    rfc,
                    telefono,
                    fecha_ingreso,
                    tipo_contrato,
                    numero_empleado,
                    salario_base,
                    estatus_laboral
                })
            });

            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast('Datos de colaboradora actualizados.', 'success');
                }
                this.closeEditGeneralDataModal();
                this.loadProfileData(this.currentUserId);

                // Si es el usuario logueado, actualizar ficha principal
                if (window.currentUser && window.currentUser.id === this.currentUserId) {
                    window.currentUser = { ...window.currentUser, ...data.data };
                    if (window.empleadoMod) {
                        window.empleadoMod.renderProfile(window.currentUser);
                    }
                    const nameHeader = document.getElementById('current-user-name');
                    if (nameHeader) nameHeader.textContent = window.currentUser.nombre;
                }
            } else {
                alert(data.error || 'Error al actualizar datos.');
            }
        } catch (err) {
            console.error('Error guardando datos generales:', err);
        }
    }
}

window.perfilMod = new PerfilModule();
