class QuickLinksManager {
    constructor() {
        this.links = [];
        this.currentCategory = 'all';
        this.editingId = null;
        this.init();
    }

    async init() {
        await this.loadLinks();
        this.setupEventListeners();
        this.render();
        
        // Auto-fill current tab URL if available
        this.autoFillCurrentTab();
    }

    async loadLinks() {
        try {
            const result = await chrome.storage.local.get(['quickLinks']);
            this.links = result.quickLinks || [];
        } catch (error) {
            console.error('Error loading links:', error);
            this.links = [];
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
            this.showModal();
        });

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterLinks(e.target.value);
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

    async autoFillCurrentTab() {
        try {
            // Check for pending link from context menu first
            const pendingResult = await chrome.storage.local.get(['pendingLink']);
            if (pendingResult.pendingLink && Date.now() - pendingResult.pendingLink.timestamp < 5000) {
                // Auto-open modal with pending link data
                setTimeout(() => {
                    this.showModal();
                    document.getElementById('link-title').value = pendingResult.pendingLink.title;
                    document.getElementById('link-url').value = pendingResult.pendingLink.url;
                }, 100);
                
                // Clear the pending link
                chrome.storage.local.remove(['pendingLink']);
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                // Only auto-fill if adding a new link, not editing
                const titleInput = document.getElementById('link-title');
                const urlInput = document.getElementById('link-url');
                
                // Set up event listeners for auto-fill when modal opens
                const addBtn = document.getElementById('add-btn');
                addBtn.addEventListener('click', () => {
                    setTimeout(() => {
                        if (!this.editingId) {
                            if (!titleInput.value) titleInput.value = tab.title;
                            if (!urlInput.value) urlInput.value = tab.url;
                        }
                    }, 100);
                });
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

        const linkData = {
            id: this.editingId || Date.now().toString(),
            title,
            url,
            category,
            description,
            createdAt: this.editingId ? 
                this.links.find(l => l.id === this.editingId)?.createdAt : 
                new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (this.editingId) {
            const index = this.links.findIndex(l => l.id === this.editingId);
            this.links[index] = linkData;
        } else {
            this.links.unshift(linkData);
        }

        await this.saveLinks();
        this.hideModal();
        this.render();
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
        const filteredLinks = this.getFilteredLinks().filter(link =>
            link.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            link.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (link.description && link.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        this.renderLinks(filteredLinks);
    }

    getFilteredLinks() {
        if (this.currentCategory === 'all') {
            return this.links;
        }
        return this.links.filter(link => link.category === this.currentCategory);
    }

    render() {
        const filteredLinks = this.getFilteredLinks();
        this.renderLinks(filteredLinks);
    }

    renderLinks(links) {
        const container = document.getElementById('links-container');
        const emptyState = document.getElementById('empty-state');

        if (links.length === 0) {
            emptyState.style.display = 'block';
            container.querySelectorAll('.link-item').forEach(item => item.remove());
            return;
        }

        emptyState.style.display = 'none';

        // Clear existing links
        container.querySelectorAll('.link-item').forEach(item => item.remove());

        // Render links
        links.forEach(link => {
            const linkElement = this.createLinkElement(link);
            container.appendChild(linkElement);
        });
    }

    createLinkElement(link) {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'link-item';
        linkDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.link-actions')) {
                this.openLink(link.url);
            }
        });

        const favicon = this.getFaviconUrl(link.url);
        const domain = this.extractDomain(link.url);

        linkDiv.innerHTML = `
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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new QuickLinksManager();
});
