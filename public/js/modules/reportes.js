/**
 * RDL Intelligence Hub - Módulo de Reportes & Exportadores de Base de Datos
 * Exclusivo para Recursos Humanos y Dirección.
 * Permite seleccionar parámetros mediante arrastre (Drag & Drop), guardar estructuras de reporte,
 * filtrar por rango de fechas, previsualizar en vivo y descargar en Excel (.xls) y CSV.
 */

class ReportesModule {
    constructor() {
        this.catalogo = [];
        this.plantillas = [];
        this.selectedFields = [];
        this.currentTemplateId = null;
        this.draggedFieldId = null;
        this.draggedIndex = null;
        this.previewDebounceTimer = null;
        this.init();
    }

    async init() {
        // Cargar catálogo inicial
        await this.loadCatalogo();
        await this.loadPlantillas();

        // Configurar listener para cuando el usuario inicie sesión o cambie
        window.addEventListener('rdl_user_loaded', (e) => {
            this.checkUserPermissions(e.detail);
        });

        document.addEventListener('DOMContentLoaded', () => {
            if (window.currentUser) {
                this.checkUserPermissions(window.currentUser);
            }
            this.bindEvents();
        });
    }

    checkUserPermissions(user) {
        if (!user) return;
        const rolesRH = ['RH', 'ADMIN', 'ADMIN_RH', 'CONTADOR_SR', 'ABOGADA_SR'];
        const isRH = rolesRH.includes(user.rol);

        const btnHeader = document.getElementById('btn-header-reportes');
        if (btnHeader) {
            btnHeader.style.display = isRH ? 'inline-flex' : 'none';
        }

        const bannerLeft = document.getElementById('left-panel-reportes-banner');
        if (bannerLeft) {
            bannerLeft.style.display = isRH ? 'block' : 'none';
        }
    }

    bindEvents() {
        // Búsqueda en catálogo de campos
        const searchInput = document.getElementById('reporte-search-param');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderAvailablePool(e.target.value.trim().toLowerCase());
            });
        }

        // Filtro de fechas - recargar preview
        const fDesde = document.getElementById('reporte-fecha-desde');
        const fHasta = document.getElementById('reporte-fecha-hasta');
        if (fDesde) fDesde.addEventListener('change', () => this.triggerPreview());
        if (fHasta) fHasta.addEventListener('change', () => this.triggerPreview());
    }

    async loadCatalogo() {
        try {
            const res = await fetch('/api/reportes/catalogo');
            const data = await res.json();
            if (data.success) {
                this.catalogo = data.data || [];
            }
        } catch (err) {
            console.error('Error cargando catálogo de reportes:', err);
        }
    }

    async loadPlantillas() {
        try {
            const res = await fetch('/api/reportes/plantillas');
            const data = await res.json();
            if (data.success) {
                this.plantillas = data.data || [];
                this.renderPlantillasSelect();
            }
        } catch (err) {
            console.error('Error cargando plantillas de reportes:', err);
        }
    }

    renderPlantillasSelect() {
        const select = document.getElementById('select-reporte-plantilla');
        if (!select) return;

        select.innerHTML = '<option value="">-- Seleccionar Estructura Guardada --</option>';

        const optGroupSys = document.createElement('optgroup');
        optGroupSys.label = '⭐ Plantillas Estándar del Sistema';

        const optGroupCust = document.createElement('optgroup');
        optGroupCust.label = '💾 Mis Estructuras Personalizadas';

        this.plantillas.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.nombre} (${p.campos_seleccionados.length} campos)`;
            if (p.es_sistema) {
                optGroupSys.appendChild(opt);
            } else {
                optGroupCust.appendChild(opt);
            }
        });

        if (optGroupSys.children.length > 0) select.appendChild(optGroupSys);
        if (optGroupCust.children.length > 0) select.appendChild(optGroupCust);
    }

    openModal(preferredCategoryOrTemplateId = null) {
        const user = window.currentUser;
        if (!user) return;
        const rolesRH = ['RH', 'ADMIN', 'ADMIN_RH', 'CONTADOR_SR', 'ABOGADA_SR'];
        if (!rolesRH.includes(user.rol)) {
            alert('Acceso restringido: Solo Recursos Humanos y Dirección pueden exportar reportes.');
            return;
        }

        const modal = document.getElementById('modal-reportes-exportador');
        if (!modal) return;

        modal.classList.add('active');

        // Si se especificó una categoría o plantilla, seleccionarla directamente
        if (preferredCategoryOrTemplateId) {
            if (typeof preferredCategoryOrTemplateId === 'string' && isNaN(Number(preferredCategoryOrTemplateId))) {
                this.selectTemplateByCategory(preferredCategoryOrTemplateId);
                return;
            } else {
                this.selectTemplate(preferredCategoryOrTemplateId);
                return;
            }
        }

        // Si no hay campos seleccionados aún, cargar la primera plantilla del sistema
        if (this.selectedFields.length === 0 && this.plantillas.length > 0) {
            this.selectTemplate(this.plantillas[0].id);
        } else {
            this.renderAvailablePool();
            this.renderSelectedDropzone();
            this.triggerPreview();
        }
    }

    closeModal() {
        const modal = document.getElementById('modal-reportes-exportador');
        if (modal) modal.classList.remove('active');
    }

    selectTemplateByCategory(categoria) {
        const catUpper = String(categoria).toUpperCase();
        let target = null;
        if (catUpper.includes('INCIDENCIA') || catUpper.includes('AUSENCIA') || catUpper.includes('PERMISO')) {
            target = this.plantillas.find(p => p.categoria === 'INCIDENCIAS' || (p.nombre && (p.nombre.includes('Auditoría') || p.nombre.includes('Incidencias') || p.nombre.includes('Permisos'))));
        } else if (catUpper.includes('META') || catUpper.includes('RENDIMIENTO')) {
            target = this.plantillas.find(p => p.categoria === 'METAS');
        } else if (catUpper.includes('CONSOLIDADO') || catUpper.includes('MAESTRO')) {
            target = this.plantillas.find(p => p.categoria === 'CONSOLIDADO');
        } else if (catUpper.includes('COLABORADOR') || catUpper.includes('PERSONAL')) {
            target = this.plantillas.find(p => p.categoria === 'COLABORADORES');
        }

        if (target) {
            this.selectTemplate(target.id);
        } else if (this.plantillas.length > 0) {
            this.selectTemplate(this.plantillas[0].id);
        }
    }

    selectTemplate(templateId) {
        if (!templateId) return;
        this.currentTemplateId = parseInt(templateId, 10);

        const select = document.getElementById('select-reporte-plantilla');
        if (select) select.value = this.currentTemplateId;

        const template = this.plantillas.find(p => p.id === this.currentTemplateId);
        if (template) {
            this.selectedFields = [...template.campos_seleccionados];
            const descEl = document.getElementById('reporte-template-desc');
            if (descEl) descEl.textContent = template.descripcion || '';

            const btnDelete = document.getElementById('btn-delete-template');
            if (btnDelete) {
                btnDelete.style.display = template.es_sistema ? 'none' : 'inline-flex';
            }

            // Sincronizar botones de categorías rápidas
            const quickBtns = document.querySelectorAll('.reporte-quick-cat-btn');
            quickBtns.forEach(b => {
                const bCat = b.getAttribute('data-cat');
                if (template.categoria === bCat || (bCat === 'INCIDENCIAS' && template.nombre && template.nombre.includes('Auditoría'))) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        }

        this.renderAvailablePool();
        this.renderSelectedDropzone();
        this.triggerPreview();
    }

    renderAvailablePool(filterText = '') {
        const container = document.getElementById('available-params-pool');
        if (!container) return;

        container.innerHTML = '';

        const categorias = [
            { id: 'PERSONAL', titulo: '👤 Datos Personales & Laborales (Buk)' },
            { id: 'AUSENCIAS', titulo: '🏖️ Vacaciones & Permisos de Ausencia' },
            { id: 'METAS', titulo: '🎯 Metas & KPIs (Todos sus apartados)' }
        ];

        categorias.forEach(cat => {
            let fields = this.catalogo.filter(c => c.categoria === cat.id);
            if (filterText) {
                fields = fields.filter(c => c.label.toLowerCase().includes(filterText) || c.id.toLowerCase().includes(filterText));
            }

            if (fields.length === 0) return;

            const groupEl = document.createElement('div');
            groupEl.className = 'param-category-group';
            groupEl.innerHTML = `<h4 class="param-category-title">${cat.titulo} <small>(${fields.length})</small></h4>`;

            const listEl = document.createElement('div');
            listEl.className = 'param-chips-grid';

            fields.forEach(field => {
                const isSelected = this.selectedFields.includes(field.id);
                const chip = document.createElement('div');
                chip.className = `param-chip ${isSelected ? 'already-selected' : ''}`;
                chip.draggable = !isSelected;
                chip.title = isSelected ? 'Ya incluido en el reporte' : 'Arrastra hacia la derecha o haz clic para agregar';

                chip.innerHTML = `
                    <span class="param-chip-icon">${field.icono || '📌'}</span>
                    <span class="param-chip-name">${field.label}</span>
                    <span class="param-chip-action">${isSelected ? '✓' : '+'}</span>
                `;

                // Drag & Drop nativo
                chip.addEventListener('dragstart', (e) => {
                    if (isSelected) return e.preventDefault();
                    this.draggedFieldId = field.id;
                    e.dataTransfer.setData('text/plain', field.id);
                    e.dataTransfer.effectAllowed = 'copyMove';
                    chip.classList.add('dragging');
                });

                chip.addEventListener('dragend', () => {
                    chip.classList.remove('dragging');
                    this.draggedFieldId = null;
                });

                // Clic para agregar directamente
                chip.addEventListener('click', () => {
                    if (!isSelected) {
                        this.addField(field.id);
                    }
                });

                listEl.appendChild(chip);
            });

            groupEl.appendChild(listEl);
            container.appendChild(groupEl);
        });
    }

    renderSelectedDropzone() {
        const dropzone = document.getElementById('selected-columns-dropzone');
        const countBadge = document.getElementById('selected-count-badge');
        if (!dropzone) return;

        if (countBadge) {
            countBadge.textContent = `${this.selectedFields.length} columnas`;
        }

        dropzone.innerHTML = '';

        if (this.selectedFields.length === 0) {
            dropzone.innerHTML = `
                <div class="dropzone-empty-state">
                    <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">📥</span>
                    <strong>Arrastra aquí los parámetros que deseas exportar a Excel</strong>
                    <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
                        También puedes hacer clic en cualquier parámetro de la izquierda para agregarlo.
                    </p>
                </div>
            `;
            this.setupDropzoneEvents(dropzone);
            return;
        }

        const listWrap = document.createElement('div');
        listWrap.className = 'selected-columns-list';

        this.selectedFields.forEach((fieldId, index) => {
            const field = this.catalogo.find(c => c.id === fieldId) || { id: fieldId, label: fieldId, icono: '📌' };

            const item = document.createElement('div');
            item.className = 'selected-col-item';
            item.draggable = true;
            item.dataset.index = index;
            item.dataset.fieldId = fieldId;

            item.innerHTML = `
                <span class="col-drag-handle" title="Arrastra para reordenar columna">⠿</span>
                <span class="col-order-num">${index + 1}</span>
                <span class="col-icon">${field.icono || '📌'}</span>
                <span class="col-label">${field.label}</span>
                <span class="col-type-badge">${field.categoria || 'COL'}</span>
                <button class="col-btn-remove" onclick="event.stopPropagation(); reportesMod.removeField('${fieldId}')" title="Quitar columna">✕</button>
            `;

            // Eventos de Reordenamiento mediante Drag & Drop
            item.addEventListener('dragstart', (e) => {
                this.draggedIndex = index;
                this.draggedFieldId = fieldId;
                e.dataTransfer.setData('text/plain', fieldId);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('reordering');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('reordering');
                this.draggedIndex = null;
                this.draggedFieldId = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('drag-target-over');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-target-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-target-over');

                // Si viene de reordenamiento interno
                if (this.draggedIndex !== null && this.draggedIndex !== undefined) {
                    const fromIdx = this.draggedIndex;
                    const toIdx = index;
                    if (fromIdx !== toIdx) {
                        const itemMoved = this.selectedFields.splice(fromIdx, 1)[0];
                        this.selectedFields.splice(toIdx, 0, itemMoved);
                        this.renderSelectedDropzone();
                        this.renderAvailablePool();
                        this.triggerPreview();
                    }
                } 
                // Si viene arrastrado desde la piscina de disponibles
                else if (this.draggedFieldId) {
                    if (!this.selectedFields.includes(this.draggedFieldId)) {
                        this.selectedFields.splice(index, 0, this.draggedFieldId);
                        this.renderSelectedDropzone();
                        this.renderAvailablePool();
                        this.triggerPreview();
                    }
                }
            });

            listWrap.appendChild(item);
        });

        dropzone.appendChild(listWrap);
        this.setupDropzoneEvents(dropzone);
    }

    setupDropzoneEvents(dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            dropzone.classList.add('dropzone-active');
        });

        dropzone.addEventListener('dragleave', (e) => {
            if (!dropzone.contains(e.relatedTarget)) {
                dropzone.classList.remove('dropzone-active');
            }
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dropzone-active');

            const fieldId = e.dataTransfer.getData('text/plain') || this.draggedFieldId;
            if (fieldId && !this.selectedFields.includes(fieldId)) {
                this.selectedFields.push(fieldId);
                this.renderSelectedDropzone();
                this.renderAvailablePool();
                this.triggerPreview();
            }
        });
    }

    addField(fieldId) {
        if (!this.selectedFields.includes(fieldId)) {
            this.selectedFields.push(fieldId);
            this.renderSelectedDropzone();
            this.renderAvailablePool();
            this.triggerPreview();
        }
    }

    removeField(fieldId) {
        this.selectedFields = this.selectedFields.filter(f => f !== fieldId);
        this.renderSelectedDropzone();
        this.renderAvailablePool();
        this.triggerPreview();
    }

    addAllFields() {
        this.selectedFields = this.catalogo.map(c => c.id);
        this.renderSelectedDropzone();
        this.renderAvailablePool();
        this.triggerPreview();
    }

    clearAllFields() {
        this.selectedFields = [];
        this.renderSelectedDropzone();
        this.renderAvailablePool();
        this.triggerPreview();
    }

    applyDatePreset(preset) {
        const fDesde = document.getElementById('reporte-fecha-desde');
        const fHasta = document.getElementById('reporte-fecha-hasta');
        const now = new Date();

        if (preset === 'este_mes') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            if (fDesde) fDesde.value = firstDay;
            if (fHasta) fHasta.value = lastDay;
        } else if (preset === 'trimestre') {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            if (fDesde) fDesde.value = threeMonthsAgo.toISOString().split('T')[0];
            if (fHasta) fHasta.value = now.toISOString().split('T')[0];
        } else if (preset === 'este_anio') {
            if (fDesde) fDesde.value = `${now.getFullYear()}-01-01`;
            if (fHasta) fHasta.value = `${now.getFullYear()}-12-31`;
        } else if (preset === 'todo') {
            if (fDesde) fDesde.value = '';
            if (fHasta) fHasta.value = '';
        }

        // Marcar botón activo
        const presetBtns = document.querySelectorAll('.date-preset-btn');
        presetBtns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`preset-btn-${preset}`);
        if (activeBtn) activeBtn.classList.add('active');

        this.triggerPreview();
    }

    triggerPreview() {
        clearTimeout(this.previewDebounceTimer);
        this.previewDebounceTimer = setTimeout(() => {
            this.fetchPreview();
        }, 250);
    }

    async fetchPreview() {
        const previewContainer = document.getElementById('reporte-preview-table-wrapper');
        const totalCountEl = document.getElementById('reporte-total-preview-count');
        if (!previewContainer) return;

        if (this.selectedFields.length === 0) {
            previewContainer.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 30px;">Selecciona al menos 1 parámetro para generar la previsualización.</div>';
            if (totalCountEl) totalCountEl.textContent = '0';
            return;
        }

        previewContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px;">⏳ Consultando base de datos en tiempo real...</div>';

        const fDesde = document.getElementById('reporte-fecha-desde')?.value || null;
        const fHasta = document.getElementById('reporte-fecha-hasta')?.value || null;

        try {
            const res = await fetch('/api/reportes/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campos: this.selectedFields,
                    fecha_desde: fDesde,
                    fecha_hasta: fHasta
                })
            });

            const data = await res.json();
            if (data.success) {
                if (totalCountEl) totalCountEl.textContent = data.total;
                this.renderPreviewTable(data.columns, data.rows);
            } else {
                previewContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px;">${data.error || 'Error cargando datos'}</div>`;
            }
        } catch (err) {
            console.error('Error al generar previsualización:', err);
            previewContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">Error de conexión al consultar preview.</div>';
        }
    }

    renderPreviewTable(columns, rows) {
        const wrapper = document.getElementById('reporte-preview-table-wrapper');
        if (!wrapper) return;

        if (rows.length === 0) {
            wrapper.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 30px;">No se encontraron registros en el rango de fechas seleccionado.</div>';
            return;
        }

        let ths = columns.map(col => `<th>${col.label}</th>`).join('');
        let trs = rows.map(row => {
            const tds = columns.map(col => {
                const fieldKey = col.id || col.key;
                let val = row[fieldKey];
                if (val === null || val === undefined || val === '') val = '-';
                if (col.type === 'currency' && typeof val === 'number') {
                    val = `$${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
                }

                // Renderizar estatus corporativo con badges visuales
                if (fieldKey === 'inc_estatus' || fieldKey === 'meta_estatus' || fieldKey === 'estatus_laboral') {
                    const upper = String(val).toUpperCase();
                    let badgeClass = 'badge-jr';
                    let icon = '⚖️';
                    if (upper.includes('APROB') || upper === 'ACTIVO' || upper.includes('COMPLET') || upper.includes('CONCLU')) {
                        badgeClass = 'badge-jr';
                        icon = '✅';
                    } else if (upper.includes('PEND') || upper.includes('PROGRESO') || upper.includes('REVISI')) {
                        badgeClass = 'badge-sr';
                        icon = '⏳';
                    } else if (upper.includes('RECHAZ') || upper === 'BAJA' || upper === 'INACTIVO' || upper.includes('RIESGO') || upper.includes('CANCEL')) {
                        badgeClass = 'badge-admin';
                        icon = '❌';
                    }
                    return `<td><span class="role-badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem;">${icon} ${val}</span></td>`;
                }

                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${tds}</tr>`;
        }).join('');

        wrapper.innerHTML = `
            <table class="data-table preview-excel-table">
                <thead><tr>${ths}</tr></thead>
                <tbody>${trs}</tbody>
            </table>
        `;
    }

    async saveCurrentTemplate() {
        if (this.selectedFields.length === 0) {
            alert('Debes tener al menos 1 columna seleccionada para guardar la estructura.');
            return;
        }

        const nombre = prompt('Ingresa un nombre para guardar esta estructura de reporte:\n(Ej: Reporte Trimestral de Metas & KPIs)');
        if (!nombre || !nombre.trim()) return;

        const descripcion = prompt('Descripción opcional del reporte:', 'Estructura personalizada para exportación periódica.');

        try {
            const res = await fetch('/api/reportes/plantillas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: nombre.trim(),
                    descripcion: (descripcion || '').trim(),
                    categoria: 'PERSONALIZADA',
                    campos_seleccionados: this.selectedFields,
                    creado_por: window.currentUser ? window.currentUser.nombre : 'Recursos Humanos'
                })
            });

            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast('✅ Estructura de reporte guardada exitosamente.', 'success');
                }
                await this.loadPlantillas();
                this.selectTemplate(data.data.id);
            } else {
                alert(data.error || 'Error al guardar la estructura.');
            }
        } catch (err) {
            console.error('Error al guardar plantilla:', err);
            alert('Error de conexión al guardar estructura.');
        }
    }

    async deleteCurrentTemplate() {
        if (!this.currentTemplateId) return;
        const template = this.plantillas.find(p => p.id === this.currentTemplateId);
        if (!template) return;

        if (template.es_sistema) {
            alert('No es posible eliminar las plantillas estándar del sistema.');
            return;
        }

        if (!confirm(`¿Estás seguro de que deseas eliminar la estructura "${template.nombre}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/reportes/plantillas/${this.currentTemplateId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                if (window.clientSocket) {
                    window.clientSocket.showToast('Estructura eliminada con éxito.', 'info');
                }
                await this.loadPlantillas();
                if (this.plantillas.length > 0) {
                    this.selectTemplate(this.plantillas[0].id);
                }
            } else {
                alert(data.error || 'Error al eliminar plantilla.');
            }
        } catch (err) {
            console.error('Error al eliminar plantilla:', err);
        }
    }

    async exportar(formato = 'excel') {
        if (this.selectedFields.length === 0) {
            alert('Por favor selecciona al menos una columna antes de descargar el reporte.');
            return;
        }

        const btnExcel = document.getElementById('btn-download-excel');
        const btnCsv = document.getElementById('btn-download-csv');

        if (formato === 'excel' && btnExcel) {
            btnExcel.disabled = true;
            btnExcel.textContent = '⏳ Generando Excel...';
        }
        if (formato === 'csv' && btnCsv) {
            btnCsv.disabled = true;
            btnCsv.textContent = '⏳ Generando CSV...';
        }

        const fDesde = document.getElementById('reporte-fecha-desde')?.value || null;
        const fHasta = document.getElementById('reporte-fecha-hasta')?.value || null;
        const currentTemp = this.plantillas.find(p => p.id === this.currentTemplateId);
        const reportTitle = currentTemp ? currentTemp.nombre : 'Reporte_Personalizado_FALCONT';

        try {
            const res = await fetch('/api/reportes/exportar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    formato,
                    campos: this.selectedFields,
                    fecha_desde: fDesde,
                    fecha_hasta: fHasta,
                    nombre_reporte: reportTitle
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error en el servidor al exportar');
            }

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;

            const dateStr = new Date().toISOString().split('T')[0];
            const cleanTitle = reportTitle.replace(/[^\w\s-]/gi, '').trim().replace(/\s+/g, '_');
            const ext = formato === 'csv' ? 'csv' : 'xls';
            a.download = `${cleanTitle}_${dateStr}.${ext}`;

            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            a.remove();

            if (window.clientSocket) {
                window.clientSocket.showToast(`📊 Reporte ${formato.toUpperCase()} descargado con éxito.`, 'success');
            }
        } catch (err) {
            console.error('Error descargando reporte:', err);
            alert(`No se pudo descargar el reporte: ${err.message}`);
        } finally {
            if (btnExcel) {
                btnExcel.disabled = false;
                btnExcel.textContent = '📥 Descargar en Excel (.xls)';
            }
            if (btnCsv) {
                btnCsv.disabled = false;
                btnCsv.textContent = '📄 Descargar en CSV (UTF-8)';
            }
        }
    }
}

window.reportesMod = new ReportesModule();
