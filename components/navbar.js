// components/navbar.js
class NavbarComponent {
    constructor(basePath = './') {
        this.basePath = basePath;
        this.currentPage = this.getCurrentPage();
        this.menuOpen = false;
    }

    getCurrentPage() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('image-compressor')) return 'image-compressor';
        if (path.includes('doc-converter')) return 'doc-converter';
        if (path.includes('what-is-scrapestack')) return 'what-is-scrapestack';
        if (path.includes('how-to-scrape-a-website')) return 'how-to-scrape';
        if (path.includes('scrapestack-api-details')) return 'api-details';
        return 'home';
    }

    render() {
        const homeLink = this.basePath + 'index.html';
        const imgCompressorLink = this.basePath + 'image-compressor/image_compressor.html';
        const docConverterLink = this.basePath + 'Doc-Converter/public/doc-converter.html';
        const whatIsScrapestackLink = this.basePath + 'scrapestack-alternative/what-is-scrapestack.html';
        const howToScrapeLink = this.basePath + 'scrapestack-alternative/how-to-scrape-a-website.html';
        const apiDetailsLink = this.basePath + 'scrapestack-alternative/scrapestack-api-details.html';
        
        return `
            <nav class="navbar">
                <div class="nav-container">
                    <div class="nav-logo">
                        <a href="${homeLink}" target="_blank" rel="noopener noreferrer">
                            <img src="${this.basePath}image-compressor/images/logo.png" alt="ScrapeStack Logo" class="logo-img" onerror="this.style.display='none'">
                        </a>
                    </div>
                    <div class="nav-menu" id="navMenu">
                        <ul class="nav-links">
                            <li><a href="${homeLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'home' ? 'active' : ''}">Home</a></li>
                            <li><a href="${imgCompressorLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'image-compressor' ? 'active' : ''}">Image Compressor</a></li>
                            <li><a href="${docConverterLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'doc-converter' ? 'active' : ''}">Doc Converter</a></li>
                            <li><a href="${whatIsScrapestackLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'what-is-scrapestack' ? 'active' : ''}">What is ScrapeStack?</a></li>
                            <li><a href="${howToScrapeLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'how-to-scrape' ? 'active' : ''}">How to Scrape</a></li>
                            <li><a href="${apiDetailsLink}" target="_blank" rel="noopener noreferrer" class="nav-link ${this.currentPage === 'api-details' ? 'active' : ''}">API Details</a></li>
                        </ul>
                    </div>
                    <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation menu">
                        <i class="fas fa-bars"></i>
                    </button>
                </div>
            </nav>
            <div class="nav-overlay" id="navOverlay"></div>
        `;
    }

    initMobileMenu() {
        const navToggle = document.getElementById('navToggle');
        const navMenu = document.getElementById('navMenu');
        const navOverlay = document.getElementById('navOverlay');
        const body = document.body;

        const closeMenu = () => {
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                if (navOverlay) navOverlay.classList.remove('active');
                body.classList.remove('menu-open');
                if (navToggle) navToggle.setAttribute('aria-label', 'Open menu');
            }
        };

        const openMenu = () => {
            if (navMenu && !navMenu.classList.contains('active')) {
                navMenu.classList.add('active');
                if (navOverlay) navOverlay.classList.add('active');
                body.classList.add('menu-open');
                if (navToggle) navToggle.setAttribute('aria-label', 'Close menu');
            }
        };

        if (navToggle) {
            navToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (navMenu && navMenu.classList.contains('active')) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });
        }

        if (navOverlay) {
            navOverlay.addEventListener('click', closeMenu);
        }

        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    closeMenu();
                }
            });
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && navMenu && navMenu.classList.contains('active')) {
                closeMenu();
            }
            if (window.innerWidth > 768 && body.classList.contains('menu-open')) {
                body.classList.remove('menu-open');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navMenu && navMenu.classList.contains('active')) {
                closeMenu();
            }
        });
    }

    inject() {
        // Insert navbar at the beginning of body
        const navbarHTML = this.render();
        document.body.insertAdjacentHTML('afterbegin', navbarHTML);
        
        // Initialize mobile menu after DOM is updated
        setTimeout(() => {
            this.initMobileMenu();
        }, 0);
    }
}

function getNavbarBasePath() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes('/doc-converter/public/')) {
        return '../../';
    }

    if (path.includes('/image-compressor/')) {
        return '../';
    }

    return './';
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const basePath = getNavbarBasePath();
        const navbar = new NavbarComponent(basePath);
        navbar.inject();
    });
} else {
    const basePath = getNavbarBasePath();
    const navbar = new NavbarComponent(basePath);
    navbar.inject();
}