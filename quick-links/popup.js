class QuickLinksManager {
    constructor() {
        this.links = [];
        this.currentCategory = 'all';
        this.searchTerm = '';
        this.editingId = null;
        this.currentSort = 'manual';
        this.draggedElement = null;
        this.init();
    }

    async init() {
        await this.loadLinks();
        await this.loadSortPreference();
        this.setupEventListeners();
        this.render();
        
        // Check for pending link from context menu
        this.checkPendingLink();
    }

    async loadLinks() {
        try {
            const result = await chrome.storage.local.get(['quickLinks']);
            this.links = result.quickLinks || [];
            
            // Ensure all links have a manual order property
            this.links.forEach((link, index) => {
                if (typeof link.manualOrder !== 'number') {
                    link.manualOrder = index;
                }
            });
        } catch (error) {
            console.error('Error loading links:', error);
            this.links = [];
        }
    }

    async loadSortPreference() {
        try {
            const result = await chrome.storage.local.get(['sortPreference']);
            this.currentSort = result.sortPreference || 'manual';
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect) {
                sortSelect.value = this.currentSort;
                this.updateSortMode();
            }
        } catch (error) {
            console.error('Error loading sort preference:', error);
        }
    }

    async saveLinks() {
        try {
            await chrome.storage.local.set({ quickLinks: this.links });
        } catch (error) {
            console.error('Error saving links:', error);
        }
    }

    setupEventListeners() {
        // Add button
        document.getElementById('add-btn').addEventListener('click', () => {
            this.handleAddLink();
        });

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterLinks(e.target.value);
        });

        // Sort select
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.saveSortPreference();
            this.updateSortMode();
            this.render();
        });

        // Category tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveCategory(e.target.dataset.category);
            });
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('link-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveLink();
        });

        // Close modal on outside click
        document.getElementById('link-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModal();
            }
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.getElementById('search-input').focus();
            }
        });
    }

    showModal(link = null) {
        this.editingId = link ? link.id : null;
        const modal = document.getElementById('link-modal');
        const title = document.getElementById('modal-title');
        const saveBtn = document.getElementById('save-btn');

        if (link) {
            title.textContent = 'Edit Link';
            saveBtn.textContent = 'Update';
            this.fillForm(link);
        } else {
            title.textContent = 'Add Link';
            saveBtn.textContent = 'Save';
            this.clearForm();
        }

        modal.classList.add('show');
        document.getElementById('link-title').focus();
    }

    hideModal() {
        const modal = document.getElementById('link-modal');
        modal.classList.remove('show');
        this.editingId = null;
        this.clearForm();
    }

    fillForm(link) {
        document.getElementById('link-title').value = link.title;
        document.getElementById('link-url').value = link.url;
        document.getElementById('link-category').value = link.category;
        document.getElementById('link-description').value = link.description || '';
    }

    clearForm() {
        document.getElementById('link-form').reset();
    }

    async checkPendingLink() {
        try {
            // Check for pending link from context menu first
            const pendingResult = await chrome.storage.local.get(['pendingLink']);
            if (pendingResult.pendingLink && Date.now() - pendingResult.pendingLink.timestamp < 5000) {
                // Auto-open modal with pending link data
                this.showModal();
                document.getElementById('link-title').value = pendingResult.pendingLink.title;
                document.getElementById('link-url').value = pendingResult.pendingLink.url;
                
                // Clear the pending link
                chrome.storage.local.remove(['pendingLink']);
            }
        } catch (error) {
            console.error('Error checking pending link:', error);
        }
    }

    async handleAddLink() {
        this.showModal();
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                const titleInput = document.getElementById('link-title');
                const urlInput = document.getElementById('link-url');
                
                // Only auto-fill if fields are empty (which they should be for new link)
                if (!titleInput.value) titleInput.value = tab.title;
                if (!urlInput.value) urlInput.value = tab.url;
            }
        } catch (error) {
            console.error('Error getting current tab:', error);
        }
    }

    async saveLink() {
        const title = document.getElementById('link-title').value.trim();
        const url = document.getElementById('link-url').value.trim();
        const category = document.getElementById('link-category').value;
        const description = document.getElementById('link-description').value.trim();

        if (!title || !url) {
            alert('Please fill in all required fields');
            return;
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            alert('Please enter a valid URL');
            return;
        }

        const now = new Date().toISOString();
        const linkData = {
            id: this.editingId || Date.now().toString(),
            title,
            url,
            category,
            description,
            createdAt: this.editingId ? 
                this.links.find(l => l.id === this.editingId)?.createdAt : 
                now,
            updatedAt: now
        };

        if (this.editingId) {
            const index = this.links.findIndex(l => l.id === this.editingId);
            this.links[index] = linkData;
        } else {
            this.links.unshift(linkData);
            // Update manual order for new links
            this.links.forEach((link, index) => {
                link.manualOrder = index;
            });
        }

        await this.saveLinks();
        this.hideModal();
        this.render();
    }

    async saveSortPreference() {
        try {
            await chrome.storage.local.set({ sortPreference: this.currentSort });
        } catch (error) {
            console.error('Error saving sort preference:', error);
        }
    }

    updateSortMode() {
        const container = document.getElementById('links-container');
        if (this.currentSort === 'manual') {
            container.classList.add('manual-sort');
        } else {
            container.classList.remove('manual-sort');
        }
    }

    async deleteLink(id) {
        if (confirm('Are you sure you want to delete this link?')) {
            this.links = this.links.filter(l => l.id !== id);
            await this.saveLinks();
            this.render();
        }
    }

    setActiveCategory(category) {
        this.currentCategory = category;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        this.render();
    }

    filterLinks(searchTerm) {
        this.searchTerm = searchTerm.trim().toLowerCase();
        this.render();
    }

    getFilteredLinks() {
        let filteredLinks = this.links;

        // Filter by category
        if (this.currentCategory !== 'all') {
            filteredLinks = filteredLinks.filter(link => link.category === this.currentCategory);
        }

        // Filter by search term
        if (this.searchTerm) {
            filteredLinks = filteredLinks.filter(link =>
                link.title.toLowerCase().includes(this.searchTerm) ||
                link.url.toLowerCase().includes(this.searchTerm) ||
                (link.description && link.description.toLowerCase().includes(this.searchTerm))
            );
        }

        // Apply sorting
        switch (this.currentSort) {
            case 'manual':
                filteredLinks.sort((a, b) => (a.manualOrder || 0) - (b.manualOrder || 0));
                break;
            case 'title-asc':
                filteredLinks.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'title-desc':
                filteredLinks.sort((a, b) => b.title.localeCompare(a.title));
                break;
            case 'date-desc':
                filteredLinks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'date-asc':
                filteredLinks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'category':
                filteredLinks.sort((a, b) => a.category.localeCompare(b.category));
                break;
            case 'url':
                filteredLinks.sort((a, b) => a.url.localeCompare(b.url));
                break;
        }

        return filteredLinks;
    }

    render() {
        const filteredLinks = this.getFilteredLinks();
        this.updateSortMode();
        this.renderLinks(filteredLinks);
    }

    renderLinks(links) {
        const container = document.getElementById('links-container');
        const emptyState = document.getElementById('empty-state');

        // Clear existing links (keep empty state element)
        Array.from(container.children).forEach(child => {
            if (child.id !== 'empty-state') container.removeChild(child);
        });

        if (links.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        const fragment = document.createDocumentFragment();
        links.forEach(link => {
            fragment.appendChild(this.createLinkElement(link));
        });
        container.appendChild(fragment);
    }

    createLinkElement(link) {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'link-item';
        linkDiv.dataset.linkId = link.id;
        
        // Add draggable attributes for manual sort mode
        if (this.currentSort === 'manual') {
            linkDiv.draggable = true;
        }
        
        linkDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.link-actions') && !e.target.closest('.drag-handle')) {
                this.openLink(link.url);
            }
        });

        const favicon = this.getFaviconUrl(link.url);
        const domain = this.extractDomain(link.url);

        linkDiv.innerHTML = `
            <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div class="link-favicon">
                <img src="${favicon}" alt="" onerror="this.parentElement.textContent='🔗'">
            </div>
            <div class="link-content">
                <div class="link-title">${this.escapeHtml(link.title)}</div>
                <div class="link-url">${this.escapeHtml(domain)}</div>
                ${link.description ? `<div class="link-description">${this.escapeHtml(link.description)}</div>` : ''}
            </div>
            <span class="category-badge ${link.category}">${link.category}</span>
            <div class="link-actions">
                <button class="action-btn edit" title="Edit link">✏</button>
                <button class="action-btn delete" title="Delete link">×</button>
            </div>
        `;

        // Add event listeners for action buttons
        linkDiv.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showModal(link);
        });

        linkDiv.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteLink(link.id);
        });

        // Add drag event listeners
        if (this.currentSort === 'manual') {
            this.setupDragListeners(linkDiv);
        }

        return linkDiv;
    }

    openLink(url) {
        chrome.tabs.create({ url });
        window.close();
    }

    getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch {
            return '';
        }
    }

    extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    setupDragListeners(element) {
        element.addEventListener('dragstart', (e) => {
            this.draggedElement = element;
            element.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', element.outerHTML);
        });

        element.addEventListener('dragend', (e) => {
            element.classList.remove('dragging');
            this.draggedElement = null;
            // Remove all drag-over classes
            document.querySelectorAll('.link-item').forEach(item => {
                item.classList.remove('drag-over');
            });
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (this.draggedElement && this.draggedElement !== element) {
                element.classList.add('drag-over');
            }
        });

        element.addEventListener('dragleave', (e) => {
            element.classList.remove('drag-over');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            
            if (this.draggedElement && this.draggedElement !== element) {
                this.reorderLinks(this.draggedElement.dataset.linkId, element.dataset.linkId);
            }
        });
    }

    async reorderLinks(draggedId, targetId) {
        const draggedIndex = this.links.findIndex(link => link.id === draggedId);
        const targetIndex = this.links.findIndex(link => link.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;

        // Remove dragged item and insert at target position
        const [draggedLink] = this.links.splice(draggedIndex, 1);
        this.links.splice(targetIndex, 0, draggedLink);

        // Update manual order for all links
        this.links.forEach((link, index) => {
            link.manualOrder = index;
        });

        await this.saveLinks();
        this.render();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new QuickLinksManager();
});
