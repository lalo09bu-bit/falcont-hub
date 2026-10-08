/**
 * RDL Intelligence Hub - Muro Corporativo Estilo Facebook
 * Soporte para comunicados con imágenes adjuntas, drag & drop, copiado/pegado y zoom en lightbox.
 */

class FeedModule {
    constructor() {
        this.posts = [];
        this.currentImageBase64 = null;
        this.init();
    }

    init() {
        this.bindEvents();

        window.addEventListener('rdl_nuevo_post', (e) => {
            this.handleNuevoPost(e.detail);
        });

        window.addEventListener('rdl_like_actualizado', (e) => {
            this.handleLikeActualizado(e.detail);
        });

        window.addEventListener('rdl_nuevo_comentario', (e) => {
            this.handleNuevoComentario(e.detail);
        });
    }

    bindEvents() {
        const form = document.getElementById('form-create-post');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitPost();
            });
        }

        // 1. Selector de imagen para el comunicado
        const btnAttach = document.getElementById('btn-trigger-post-image');
        const fileInput = document.getElementById('post-imagen-input');
        const btnRemove = document.getElementById('btn-remove-post-image');

        if (btnAttach && fileInput) {
            btnAttach.addEventListener('click', () => fileInput.click());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.processImageFile(file);
            });
        }

        if (btnRemove) {
            btnRemove.addEventListener('click', () => this.clearImage());
        }

        // 2. Drag & Drop de imagen sobre el compositor
        const composerCard = document.getElementById('post-composer-card');
        if (composerCard) {
            composerCard.addEventListener('dragover', (e) => {
                e.preventDefault();
                composerCard.classList.add('drag-active');
            });
            composerCard.addEventListener('dragleave', () => {
                composerCard.classList.remove('drag-active');
            });
            composerCard.addEventListener('drop', (e) => {
                e.preventDefault();
                composerCard.classList.remove('drag-active');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    this.processImageFile(file);
                }
            });
        }

        // 3. Pegar imagen con Ctrl+V directamente en el área de texto
        const contentArea = document.getElementById('post-contenido');
        if (contentArea) {
            contentArea.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        if (file) {
                            this.processImageFile(file);
                            if (window.clientSocket) {
                                window.clientSocket.showToast('📸 Imagen adjuntada desde el portapapeles.', 'info');
                            }
                        }
                    }
                }
            });
        }
    }

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona un archivo de imagen válido (PNG, JPG, WebP).');
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            alert('La imagen no debe superar los 15MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const rawBase64 = e.target.result;
            // Optimizar tamaño si es mayor a 1MB usando un Canvas invisible
            if (file.size > 1024 * 1024) {
                this.compressImage(rawBase64, (compressed) => {
                    this.setImagePreview(compressed);
                });
            } else {
                this.setImagePreview(rawBase64);
            }
        };
        reader.readAsDataURL(file);
    }

    compressImage(base64Str, callback) {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDimension = 1600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.88);
            callback(compressedBase64);
        };
        img.onerror = () => callback(base64Str);
    }

    setImagePreview(base64Data) {
        this.currentImageBase64 = base64Data;
        const previewWrap = document.getElementById('post-image-preview-wrapper');
        const previewImg = document.getElementById('post-image-preview');

        if (previewWrap && previewImg) {
            previewImg.src = base64Data;
            previewWrap.classList.remove('hidden');
        }
    }

    clearImage() {
        this.currentImageBase64 = null;
        const previewWrap = document.getElementById('post-image-preview-wrapper');
        const previewImg = document.getElementById('post-image-preview');
        const fileInput = document.getElementById('post-imagen-input');

        if (previewWrap) previewWrap.classList.add('hidden');
        if (previewImg) previewImg.src = '';
        if (fileInput) fileInput.value = '';
    }

    async loadFeed() {
        try {
            const uid = window.currentUser ? window.currentUser.id : '';
            const res = await fetch(`/api/feed${uid ? `?usuario_id=${uid}` : ''}`);
            const data = await res.json();
            if (data.success) {
                this.posts = data.data;
                this.render();
            }
        } catch (err) {
            console.error('Error al cargar muro Facebook RDL:', err);
        }
    }

    render() {
        const container = document.getElementById('feed-stream-container');
        if (!container) return;

        container.innerHTML = '';

        if (this.posts.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No hay publicaciones en el muro en este momento.</p>';
            return;
        }

        this.posts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'glass-card feed-card';
            card.id = `feed-post-${post.id}`;

            const initials = post.autor_nombre ? post.autor_nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'FL';

            // Determinar color de badge por rol o categoría
            let catColor = 'badge-sr';
            if (post.categoria === 'Urgente') catColor = 'badge-admin';
            else if (post.categoria === 'Aviso Legal' || post.categoria === 'Aviso Fiscal') catColor = 'badge-rh';

            const isLiked = post.user_has_liked === 1 || post.user_has_liked === true;

            const safeAutor = this.escapeHtml(post.autor_nombre || 'Colaborador');
            const safeRol = this.escapeHtml(post.autor_rol || 'CORPORATIVO');
            const safeCategoria = this.escapeHtml(post.categoria || 'Corporativo');
            const safeTitulo = post.titulo ? this.escapeHtml(post.titulo) : '';
            const safeContenido = this.escapeHtml(post.contenido || '');
            const safeInitials = this.escapeHtml(initials);

            let safeImg = null;
            if (post.imagen_url && typeof post.imagen_url === 'string') {
                const trimmed = post.imagen_url.trim();
                if (trimmed.startsWith('data:image/') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
                    safeImg = trimmed;
                }
            }

            card.innerHTML = `
                <div class="post-author-bar">
                    <div class="post-author-avatar">${safeInitials}</div>
                    <div class="post-author-meta">
                        <span class="post-author-name">${safeAutor}</span>
                        <span class="post-time">${safeRol} • ${new Date(post.fecha_creacion).toLocaleDateString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span class="role-badge ${catColor}" style="margin-left: auto;">${safeCategoria}</span>
                </div>
                
                ${safeTitulo ? `<h3 class="post-title">${safeTitulo}</h3>` : ''}
                <p class="post-body">${safeContenido}</p>

                ${safeImg ? `
                    <div class="post-image-container" onclick="feedMod.openLightbox('${safeImg.replace(/'/g, "\\'")}')" title="Haz clic para ampliar la imagen">
                        <img src="${safeImg}" alt="${safeTitulo || 'Comunicado FALCONT'}" class="post-feed-image" loading="lazy">
                    </div>
                ` : ''}

                <div class="post-interactions">
                    <button class="btn-like ${isLiked ? 'liked' : ''}" id="btn-like-${post.id}" onclick="feedMod.darLike(${post.id})">
                        👍 <span>${isLiked ? 'Te gusta' : 'Me Gusta'}</span> (<span id="like-count-${post.id}">${post.likes_count}</span>)
                    </button>
                    <button class="btn-comment-toggle" id="btn-comments-toggle-${post.id}" onclick="feedMod.toggleComentarios(${post.id})" title="Ver y escribir comentarios">
                        💬 <span id="comments-count-${post.id}">${post.comentarios_count || 0}</span> Comentarios
                    </button>
                </div>

                <!-- Sección Desplegable de Comentarios -->
                <div class="post-comments-container hidden" id="comments-container-${post.id}">
                    <div class="comments-list" id="comments-list-${post.id}">
                        <div class="comments-empty-notice">Cargando comentarios...</div>
                    </div>

                    <!-- Caja para Escribir Comentario (Habilitada para TODOS los perfiles) -->
                    <form class="comment-input-form" onsubmit="feedMod.submitComentario(event, ${post.id})">
                        <div class="comment-avatar-bubble">${window.currentUser && window.currentUser.nombre ? window.currentUser.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'FL'}</div>
                        <div class="comment-field-wrapper">
                            <input 
                                type="text" 
                                class="comment-input" 
                                id="comment-input-${post.id}" 
                                placeholder="Escribe un comentario..." 
                                maxlength="500" 
                                autocomplete="off"
                                required
                            />
                            <button type="submit" class="btn-send-comment" id="btn-send-comment-${post.id}" title="Publicar Comentario">
                                Enviar
                            </button>
                        </div>
                    </form>
                </div>
            `;

            container.appendChild(card);
        });

        if (typeof gsap !== 'undefined') {
            gsap.from('.feed-card', {
                opacity: 0,
                y: 15,
                stagger: 0.06,
                duration: 0.35,
                ease: 'power2.out'
            });
        }
    }

    openLightbox(imgSrc) {
        const lightboxModal = document.getElementById('modal-image-lightbox');
        const lightboxImg = document.getElementById('lightbox-full-image');
        if (lightboxModal && lightboxImg) {
            lightboxImg.src = imgSrc;
            lightboxModal.classList.add('active');
        }
    }

    async submitPost() {
        const user = window.currentUser;
        if (!user) return;

        // Validar permisos en frontend (Permitir RH, ADMIN_RH, ADMIN y CONTADOR_SR)
        const isAuthorized = user.rol === 'ADMIN' || user.rol === 'CONTADOR_SR' || user.rol === 'ABOGADA_SR' || user.rol === 'RH' || user.rol === 'ADMIN_RH';
        if (!isAuthorized) {
            alert('Solo Recursos Humanos (RH), Dirección y Contadores SR pueden publicar en el Muro.');
            return;
        }

        const titulo = document.getElementById('post-titulo').value.trim();
        const contenido = document.getElementById('post-contenido').value.trim();
        const categoria = document.getElementById('post-categoria').value;

        if (!contenido) return;

        const submitBtn = document.getElementById('btn-submit-post');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Publicando...';
        }

        const payload = {
            autor_id: user.id,
            autor_nombre: user.nombre,
            autor_rol: user.rol,
            autor_avatar: user.avatar || user.nombre.substring(0, 2).toUpperCase(),
            titulo,
            contenido,
            categoria,
            imagen_url: this.currentImageBase64 || null
        };

        try {
            const res = await fetch('/api/feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('form-create-post').reset();
                this.clearImage();
                if (window.clientSocket) {
                    window.clientSocket.showToast('📢 Comunicado publicado exitosamente en el muro.', 'success');
                }
            } else {
                alert(data.error || 'Error al publicar el comunicado.');
            }
        } catch (err) {
            console.error('Error al publicar post:', err);
            alert('Error de conexión al publicar el comunicado.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Publicar en el Muro FALCONT';
            }
        }
    }

    async darLike(postID) {
        const user = window.currentUser;
        const usuario_id = user ? user.id : 1;
        try {
            const res = await fetch(`/api/feed/${postID}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id })
            });
            const data = await res.json();
            if (data.success) {
                const countEl = document.getElementById(`like-count-${postID}`);
                if (countEl) countEl.textContent = data.data.likes_count;

                const btn = document.getElementById(`btn-like-${postID}`);
                if (btn) {
                    if (data.data.action === 'liked') {
                        btn.classList.add('liked');
                        btn.innerHTML = `👍 <span>Te gusta</span> (<span id="like-count-${postID}">${data.data.likes_count}</span>)`;
                    } else {
                        btn.classList.remove('liked');
                        btn.innerHTML = `👍 <span>Me Gusta</span> (<span id="like-count-${postID}">${data.data.likes_count}</span>)`;
                    }
                }

                const post = this.posts.find(p => p.id === postID);
                if (post) {
                    post.likes_count = data.data.likes_count;
                    post.user_has_liked = data.data.action === 'liked' ? 1 : 0;
                }
            }
        } catch (err) {
            console.error('Error al dar like:', err);
        }
    }

    handleNuevoPost(post) {
        const exists = this.posts.find(p => p.id === post.id);
        if (!exists) {
            this.posts.unshift(post);
            this.render();
        }
    }

    handleLikeActualizado(data) {
        const idx = this.posts.findIndex(p => p.id === data.id);
        if (idx !== -1) {
            this.posts[idx].likes_count = data.likes_count;
            const countEl = document.getElementById(`like-count-${data.id}`);
            if (countEl) countEl.textContent = data.likes_count;

            if (window.currentUser && data.usuario_id === window.currentUser.id) {
                this.posts[idx].user_has_liked = data.action === 'liked' ? 1 : 0;
                const btn = document.getElementById(`btn-like-${data.id}`);
                if (btn) {
                    if (data.action === 'liked') {
                        btn.classList.add('liked');
                        btn.innerHTML = `👍 <span>Te gusta</span> (<span id="like-count-${data.id}">${data.likes_count}</span>)`;
                    } else {
                        btn.classList.remove('liked');
                        btn.innerHTML = `👍 <span>Me Gusta</span> (<span id="like-count-${data.id}">${data.likes_count}</span>)`;
                    }
                }
            }
        }
    }

    async toggleComentarios(postId) {
        const container = document.getElementById(`comments-container-${postId}`);
        if (!container) return;

        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            await this.loadComentarios(postId);
            const input = document.getElementById(`comment-input-${postId}`);
            if (input) input.focus();
        } else {
            container.classList.add('hidden');
        }
    }

    async loadComentarios(postId) {
        const listEl = document.getElementById(`comments-list-${postId}`);
        if (!listEl) return;

        try {
            const res = await fetch(`/api/feed/${postId}/comentarios`);
            const data = await res.json();
            if (data.success) {
                this.renderComentarios(postId, data.data || []);
            } else {
                listEl.innerHTML = '<div class="comments-empty-notice">No se pudieron cargar los comentarios.</div>';
            }
        } catch (err) {
            console.error('Error al cargar comentarios:', err);
            listEl.innerHTML = '<div class="comments-empty-notice">Error de conexión al cargar comentarios.</div>';
        }
    }

    renderComentarios(postId, comentarios) {
        const listEl = document.getElementById(`comments-list-${postId}`);
        if (!listEl) return;

        listEl.innerHTML = '';

        if (!comentarios || comentarios.length === 0) {
            listEl.innerHTML = '<div class="comments-empty-notice">No hay comentarios aún. ¡Sé la primera persona en participar!</div>';
            return;
        }

        comentarios.forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            item.id = `comment-item-${c.id}`;

            const initials = c.autor_avatar || (c.autor_nombre ? c.autor_nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'FL');
            const fechaStr = new Date(c.fecha).toLocaleDateString('es-MX', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });

            item.innerHTML = `
                <div class="comment-author-avatar">${this.escapeHtml(initials)}</div>
                <div class="comment-content-bubble">
                    <div class="comment-author-row">
                        <span class="comment-author-name">${this.escapeHtml(c.autor_nombre || 'Colaborador')}</span>
                        <span class="comment-author-puesto">${this.escapeHtml(c.autor_puesto || c.autor_rol || 'Colaborador')}</span>
                        <span class="comment-date">${fechaStr}</span>
                    </div>
                    <p class="comment-text">${this.escapeHtml(c.comentario)}</p>
                </div>
            `;

            listEl.appendChild(item);
        });

        listEl.scrollTop = listEl.scrollHeight;
    }

    async submitComentario(event, postId) {
        event.preventDefault();
        const input = document.getElementById(`comment-input-${postId}`);
        const sendBtn = document.getElementById(`btn-send-comment-${postId}`);
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        const user = window.currentUser;
        if (!user) {
            alert('Debes iniciar sesión para publicar un comentario.');
            return;
        }

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = '...';
        }

        const payload = {
            autor_id: user.id,
            autor_nombre: user.nombre,
            autor_avatar: user.avatar || user.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
            comentario: text
        };

        try {
            const res = await fetch(`/api/feed/${postId}/comentarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                input.value = '';
                
                // Actualizar contador
                const countEl = document.getElementById(`comments-count-${postId}`);
                if (countEl) countEl.textContent = data.comentarios_count;

                // Añadir a la lista inmediatamente
                const listEl = document.getElementById(`comments-list-${postId}`);
                if (listEl) {
                    const notice = listEl.querySelector('.comments-empty-notice');
                    if (notice) notice.remove();

                    const exists = document.getElementById(`comment-item-${data.data.id}`);
                    if (!exists) {
                        const item = document.createElement('div');
                        item.className = 'comment-item';
                        item.id = `comment-item-${data.data.id}`;

                        const initials = data.data.autor_avatar || 'FL';
                        const fechaStr = new Date(data.data.fecha).toLocaleDateString('es-MX', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        });

                        item.innerHTML = `
                            <div class="comment-author-avatar">${this.escapeHtml(initials)}</div>
                            <div class="comment-content-bubble">
                                <div class="comment-author-row">
                                    <span class="comment-author-name">${this.escapeHtml(data.data.autor_nombre || 'Colaborador')}</span>
                                    <span class="comment-author-puesto">${this.escapeHtml(data.data.autor_puesto || data.data.autor_rol || 'Colaborador')}</span>
                                    <span class="comment-date">${fechaStr}</span>
                                </div>
                                <p class="comment-text">${this.escapeHtml(data.data.comentario)}</p>
                            </div>
                        `;
                        listEl.appendChild(item);
                        listEl.scrollTop = listEl.scrollHeight;
                    }
                }
            } else {
                alert(data.error || 'Error al enviar el comentario.');
            }
        } catch (err) {
            console.error('Error al enviar comentario:', err);
            alert('Error de conexión al enviar comentario.');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Enviar';
            }
        }
    }

    handleNuevoComentario(data) {
        if (!data || !data.publicacion_id) return;

        // 1. Actualizar el contador en la tarjeta
        const countEl = document.getElementById(`comments-count-${data.publicacion_id}`);
        if (countEl) countEl.textContent = data.comentarios_count;

        // 2. Si la sección de comentarios está abierta en pantalla, agregar el comentario si no existe
        const listEl = document.getElementById(`comments-list-${data.publicacion_id}`);
        if (listEl && data.comentario) {
            const exists = document.getElementById(`comment-item-${data.comentario.id}`);
            if (!exists) {
                const notice = listEl.querySelector('.comments-empty-notice');
                if (notice) notice.remove();

                const item = document.createElement('div');
                item.className = 'comment-item';
                item.id = `comment-item-${data.comentario.id}`;

                const initials = data.comentario.autor_avatar || 'FL';
                const fechaStr = new Date(data.comentario.fecha).toLocaleDateString('es-MX', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                });

                item.innerHTML = `
                    <div class="comment-author-avatar">${this.escapeHtml(initials)}</div>
                    <div class="comment-content-bubble">
                        <div class="comment-author-row">
                            <span class="comment-author-name">${this.escapeHtml(data.comentario.autor_nombre || 'Colaborador')}</span>
                            <span class="comment-author-puesto">${this.escapeHtml(data.comentario.autor_puesto || data.comentario.autor_rol || 'Colaborador')}</span>
                            <span class="comment-date">${fechaStr}</span>
                        </div>
                        <p class="comment-text">${this.escapeHtml(data.comentario.comentario)}</p>
                    </div>
                `;
                listEl.appendChild(item);
                listEl.scrollTop = listEl.scrollHeight;
            }
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.feedMod = new FeedModule();
