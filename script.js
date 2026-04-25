// --- Firebase Config (Unified) ---
const firebaseConfig = {
    apiKey: "AIzaSyDKqr3ObVEMpZ5_1_ibW2K-KDDw1krueSA",
    authDomain: "web-admin-9561c.firebaseapp.com",
    databaseURL: "https://web-admin-9561c-default-rtdb.firebaseio.com",
    projectId: "web-admin-9561c",
    storageBucket: "web-admin-9561c.firebasestorage.app",
    messagingSenderId: "630144910800",
    appId: "1:630144910800:web:61dc192d85e892c2a565d5",
    measurementId: "G-69Z49VHQY1"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // Ensure default app is returned if already init
}

const db = firebase.database();
const auth = firebase.auth(); // Use default app auth

// Global User State
let currentUser = null;
let userProfile = null; // Data from DB
let proPrice = 10; // Default fallback price
let rzpKey = "rzp_live_SeElRgESDAvD5D"; // Default test key
let rzpCurrency = "INR"; // Default currency

// Fetch Dynamic Pricing & Razorpay Settings from DB
function initializePricing() {
    firebase.database().ref('settings/pricing').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Harden parsing to ensure we always have a valid number
            proPrice = parseFloat(data.proPrice) || 10;
            rzpKey = data.rzpKey || rzpKey;
            rzpCurrency = (data.currency || "INR").toUpperCase();
            console.log("Payment Settings Updated:", { proPrice, rzpCurrency, hasKey: !!rzpKey });
        }
    });
}
initializePricing();

// Fetch Global Site Identity (Name/Logo)
function initializeSiteIdentity() {
    firebase.database().ref('settings/global').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const name1 = data.siteName1 || 'Harsh';
            const name2 = data.siteName2 || 'Edits';

            // Update all Logo Instances
            // 1. Header Logo
            const logoHeader = document.querySelector('h1.fluid-logo');
            if (logoHeader) {
                logoHeader.innerHTML = `${name1}<span class="gradient-text">${name2}</span>`;
            }

            // 2. Preloader Logo
            const logoPreloader = document.querySelector('#preloader h1');
            if (logoPreloader) {
                logoPreloader.innerHTML = `${name1}<span class="gradient-text">${name2}</span>`;
            }

            // 3. Document Title (Optional but professional)
            document.title = `${name1} ${name2} - Pro Editing Resources`;

            // Update Discord Link
            const discordBtn = document.getElementById('discord-invite-btn');
            if (discordBtn && data.discordUrl) {
                discordBtn.href = data.discordUrl;
                discordBtn.classList.remove('hidden');
                discordBtn.classList.add('flex');
            }
        }
    });
}
initializeSiteIdentity();
let userFavorites = {}; // Local cache of favorites
let isFromFavorites = false; // Tracks context of item modal (e.g. if opened from favorites)

// Global Data Store
const appData = {
    easyWorkflow: [],
    adobeSoftware: [],
    plugins: [],
    scripts: [],
    assets: [],
    utilities: [],
    simplePluginsList: [],
    courses: [],
    banners: []
};

let donationShownOnce = localStorage.getItem('donationShownOnce') === 'true';

// Section ID mapping
const sectionIdMap = {
    'easyWorkflow': 'easy-workflow-showcase',
    'adobeSoftware': 'software',
    'plugins': 'plugins',
    'scripts': 'scripts',
    'assets': 'assets',
    'utilities': 'utilities',
    'courses': 'courses',
    'simplePluginsList': 'other-plugins',
    'userMessages': 'request-resource'
};

// ========== ADVANCED DOWNLOAD SECURITY ==========
/**
 * Secure Download Handler
 * Prevents links from appearing in the DOM as plaintext.
 * Uses Base64 obfuscation and verified decoding.
 */
// Helper to execute the actual download after verification
function executeDownload(encodedLink) {
    try {
        const link = atob(encodedLink);
        if (!link || link === '#') {
            showAlert("This link is currently unavailable.", "Broken Link", "warning");
            return false;
        }
        const win = window.open(link, '_blank');
        if (win) win.focus();
        return true;
    } catch (e) {
        console.error("Decode error:", e);
        showAlert("Error processing download link.", "Error", "error");
        return false;
    }
}

window.handleDownloadSecure = function (encodedLink, title = "Resource", isPro = true, price = 0, itemId = null) {
    // 1. Check if user is logged in (Mandatory for all downloads to track limits)
    if (!currentUser) {
        showAlert("Please log in to download resources and track your free downloads.", "Account Required", "info",
            () => { window.location.href = 'auth.html#signup'; }, "Sign Up / Log In",
            () => { /* Close/Cancel callback */ });
        return false;
    }

    const isAdmin = userProfile && userProfile.role === 'admin';
    const isPaid = userProfile && (userProfile.isPaid || userProfile.role === 'admin');

    // 2. Handle FREE items (isPro = false and price = 0)
    if (!isPro && price <= 0) {
        // Admins and Pro members have unlimited access
        if (isAdmin || isPaid) {
            return executeDownload(encodedLink);
        }

        // Check download limit for Free members
        const freeDownloads = (userProfile && userProfile.freeDownloads) || {};
        const downloadCount = Object.keys(freeDownloads).length;

        // If user already downloaded this specific item, allow it again
        if (itemId && freeDownloads[itemId]) {
            return executeDownload(encodedLink);
        }

        // If user is under the limit (2 files)
        if (downloadCount < 2) {
            // Record this download in Firebase
            if (itemId) {
                const updateRef = {};
                updateRef[`freeDownloads/${itemId}`] = firebase.database.ServerValue.TIMESTAMP;
                db.ref('users/' + currentUser.uid).update(updateRef);
            }
            return executeDownload(encodedLink);
        } else {
            // Limit reached - Show Paywall
            showAlert(
                `You have reached your limit of 2 free downloads. Support the creator to unlock unlimited access to all 1000+ premium and free resources forever!`,
                "Download Limit Reached",
                "info",
                () => { window.processPayment(proPrice * 100); },
                `Unlock Unlimited Access (₹${proPrice})`,
                () => { /* Close */ }
            );
            return false;
        }
    }

    // 3. Check for Individual Purchase first (if price is set)
    if (price > 0 && itemId) {
        const hasPurchasedItem = userProfile && userProfile.purchased && userProfile.purchased[itemId];
        if (!hasPurchasedItem && !isAdmin) {
            showAlert(
                `This premium asset is available for individual purchase at ₹${price}. Unlock it now to get permanent access.`,
                "Individual Purchase Required",
                "info",
                () => { window.processPayment(price * 100, itemId, title); },
                `Unlock for ₹${price}`,
                () => { /* Close */ }
            );
            return false;
        }
    } else if (isPro) {
        // 4. Check if user has global Pro membership
        if (!isPaid && !isAdmin) {
            showAlert(
                `Support the Creator! Your contribution helps us keep the software hub alive and growing. Unlock lifetime, unlimited access to all Premium Software, Scripts, and Assets for a one-time support amount of just ₹${proPrice}!`,
                "Unlock Lifetime Support Access",
                "info",
                () => { window.processPayment(proPrice * 100); },
                `Support & Unlock Everything (₹${proPrice})`,
                () => { /* Close/Cancel callback */ }
            );
            return false;
        }
    }

    // Access Granted (Admin, Pro, or Individual Purchase)
    return executeDownload(encodedLink);
};

// Helper to encode links for the UI
window.encodeDownloadLink = function (link) {
    if (!link || link === '#') return '';
    try {
        return btoa(link);
    } catch (e) {
        return '';
    }
};

window.handleDownload = window.handleDownloadSecure;



window.checkPremiumAccess = function (item, actionType = 'access') {
    // Legacy support for other parts of the UI if needed
    return true;
};

// --- Section Ordering ---
async function applySectionOrder() {
    try {
        const orderSnapshot = await db.ref('settings/sectionOrder').once('value');
        const visibilitySnapshot = await db.ref('settings/sectionVisibility').once('value');

        if (!orderSnapshot.exists()) {
            console.log('No custom section order found, using default');
            return;
        }

        const sectionOrder = orderSnapshot.val();
        const sectionVisibility = visibilitySnapshot.val() || {};
        const mainContainer = document.querySelector('main');

        if (!mainContainer) {
            console.error('Main container not found');
            return;
        }

        // Get all section elements
        const sections = {};
        sectionOrder.forEach(sectionKey => {
            const sectionId = sectionIdMap[sectionKey];
            if (sectionId) {
                const section = document.getElementById(sectionId);
                if (section) {
                    sections[sectionKey] = section;
                }
            }
        });

        // Reorder sections and apply visibility
        sectionOrder.forEach(sectionKey => {
            const section = sections[sectionKey];
            if (section) {
                // Check if section is disabled
                const isDisabled = sectionVisibility[sectionKey] === false;

                if (isDisabled) {
                    // Hide disabled sections from public view
                    section.style.display = 'none';
                } else {
                    // Show enabled sections and reorder
                    section.style.display = '';
                    mainContainer.appendChild(section);
                }
            }
        });

        console.log('Section order and visibility applied:', sectionOrder, sectionVisibility);
    } catch (error) {
        console.error('Error applying section order:', error);
    }
}

// --- Apply Section Names ---
function applySectionNames(sectionNames) {
    // Update Navigation Links
    const navLinks = {
        'adobeSoftware': document.querySelector('a[href="#software"]'),
        'plugins': document.querySelector('a[href="#plugins"]'),
        'scripts': document.querySelector('a[href="#scripts"]'),
        'assets': document.querySelector('a[href="#assets"]'),
        'utilities': document.querySelector('a[href="#utilities"]'),
        'courses': document.querySelector('a[href="#courses"]'),
        'simplePluginsList': document.querySelector('a[href="#other-plugins"]')
    };

    Object.keys(sectionNames).forEach(key => {
        if (navLinks[key] && sectionNames[key]) {
            navLinks[key].textContent = sectionNames[key];
        }
    });

    // Update Section Headers (h3 elements within sections)
    const sectionHeaders = {
        'adobeSoftware': document.querySelector('#software h3'),
        'plugins': document.querySelector('#plugins h3'),
        'scripts': document.querySelector('#scripts h3'),
        'assets': document.querySelector('#assets h3'),
        'utilities': document.querySelector('#utilities h3'),
        'courses': document.querySelector('#courses h3'),
        'simplePluginsList': document.querySelector('#simple-plugins h3')
    };

    Object.keys(sectionNames).forEach(key => {
        if (sectionHeaders[key] && sectionNames[key]) {
            sectionHeaders[key].textContent = sectionNames[key];
        }
    });
}

// --- Apply Site Text Content ---
function applySiteText(siteText) {
    // Hero Section
    if (siteText.heroTitle1) {
        const heroTitle1 = document.getElementById('hero-title-1');
        if (heroTitle1) heroTitle1.textContent = siteText.heroTitle1;
    }
    if (siteText.heroTitle2) {
        const heroTitle2 = document.getElementById('hero-title-2');
        if (heroTitle2) heroTitle2.textContent = siteText.heroTitle2;
    }
    if (siteText.heroDescription) {
        const heroDesc = document.getElementById('hero-description');
        if (heroDesc) heroDesc.textContent = siteText.heroDescription;
    }

    // 100+ Plugins Pack Section
    if (siteText.pluginsPackTitle) {
        const packTitle = document.getElementById('plugins-pack-title');
        if (packTitle) packTitle.textContent = siteText.pluginsPackTitle;
    }
    if (siteText.pluginsPackDescription) {
        const packDesc = document.getElementById('plugins-pack-description');
        if (packDesc) packDesc.textContent = siteText.pluginsPackDescription;
    }

    // 100+ Plugins List Page
    if (siteText.pluginsListTitle) {
        const listTitle = document.getElementById('plugins-list-title');
        if (listTitle) listTitle.textContent = siteText.pluginsListTitle;
    }
    if (siteText.pluginsListDescription) {
        const listDesc = document.getElementById('plugins-list-description');
        if (listDesc) listDesc.textContent = siteText.pluginsListDescription;
    }

    // Missing Resource Section
    if (siteText.missingResourceTitle) {
        const missingTitle = document.getElementById('missing-resource-title');
        if (missingTitle) missingTitle.textContent = siteText.missingResourceTitle;
    }
    if (siteText.missingResourceDescription) {
        const missingDesc = document.getElementById('missing-resource-description');
        if (missingDesc) missingDesc.textContent = siteText.missingResourceDescription;
    }
}

// --- Data Fetching ---
function fetchData() {
    const collections = ['easyWorkflow', 'adobeSoftware', 'plugins', 'scripts', 'assets', 'utilities', 'simplePluginsList', 'courses', 'banners'];

    // Using Promise.all with Realtime Database (once('value'))
    return Promise.all(collections.map((colName) => {
        return db.ref(colName).once('value').then((snapshot) => {
            appData[colName] = [];
            snapshot.forEach((childSnapshot) => {
                appData[colName].push({ id: childSnapshot.key, ...childSnapshot.val() });
            });
        });
    })).then(() => {
        // Fetch Settings
        return db.ref("settings/global").once('value');
    }).then((settingsSnap) => {
        // Handle Global Settings
        if (settingsSnap.exists()) {
            const settings = settingsSnap.val();
            if (settings.discordUrl) {
                const btn = document.getElementById('discord-invite-btn');
                if (btn) btn.href = settings.discordUrl;
            }
            if (settings.qrCodeImageUrl) {
                const img = document.getElementById('donation-qr');
                if (img) img.src = settings.qrCodeImageUrl;
            }
        }
        // Fetch Carousel Settings
        return db.ref("settings/carousel").once('value');
    }).then((carouselSnap) => {
        appData.carouselSettings = carouselSnap.val() || { autoSlide: true, slideSpeed: 5 };
        // Fetch Section Names
        return db.ref("settings/sectionNames").once('value');
    }).then((sectionNamesSnap) => {
        // Load and apply custom section names
        if (sectionNamesSnap.exists()) {
            appData.sectionNames = sectionNamesSnap.val();
            applySectionNames(appData.sectionNames);
        } else {
            // Default names
            appData.sectionNames = {
                adobeSoftware: 'Adobe Software',
                plugins: 'Plugins',
                scripts: 'Scripts & Extensions',
                assets: 'Assets',
                utilities: 'Utilities & Other Software',
                courses: 'Courses',
                simplePluginsList: '100+ Plugins List'
            };
        }
    }).then(() => {
        // Fetch Site Text Content
        return db.ref("settings/siteText").once('value');
    }).then((siteTextSnap) => {
        // Load and apply custom site text
        if (siteTextSnap.exists()) {
            appData.siteText = siteTextSnap.val();
            applySiteText(appData.siteText);
        } else {
            // Default text values (already in HTML)
            appData.siteText = {
                heroTitle1: 'The Ultimate',
                heroTitle2: 'Editing Resource Hub',
                heroDescription: 'Exclusive access to all the software, plugins, scripts, and assets you need. Curated for the Harsh Edits community.',
                pluginsPackTitle: '100+ Plugins Pack',
                pluginsPackDescription: 'Is pack mein After Effects, Premiere Pro, Photoshop, aur Illustrator ke liye 100 se bhi zyada plugins shamil hain. Aap is button par click karke unki poori list dekh sakte hain.',
                pluginsListTitle: '100+ Plugins',
                pluginsListDescription: 'Yahaan saare plugins ki poori list hai, unhe download karne ke liye un par click karein.',
                missingResourceTitle: 'Missing a Resource?',
                missingResourceDescription: "Can't find the plugin, script, or software you're looking for? Let us know and we'll do our best to add it to the hub!"
            };
        }
    }).then(() => {
        // Fetch Favorites if user is logged in
        if (currentUser) {
            // Use userApp database for favorites
            return db.ref(`users/${currentUser.uid}/favorites`).once('value').then(snap => {
                userFavorites = snap.val() || {};
            });
        }
    }).catch((error) => {
        console.error("Error fetching data:", error);
    });
}

// --- Rendering ---
function renderAll() {
    renderBannerCarousel();
    renderSoftware();
    renderPlugins();
    renderScripts();
    renderAssets();
    renderUtilities();
    renderCourses();
    // No dedicated render function needed for simple plugin list as it's static or linked differently, 
    // but data is now available in appData.simplePluginsList if needed in future

    initEffects();
    initSearch();
    updateFavoriteIcons(); // Update icons for dynamic content
    initStaticHeartIcons(); // Inject icons into static content
}

// --- Banner Carousel Logic ---
let carouselInterval;
let currentSlide = 0;

function renderBannerCarousel() {
    const container = document.getElementById('banner-slides');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!container || !dotsContainer) return;

    // 1. Get Firebase Banners
    let banners = (appData.banners || []).filter(b => b.active).sort((a, b) => (a.order || 0) - (b.order || 0));

    // 2. Prepend Easy Workflow Banner (Removed).
    // Use Admin Panel "Add Banner" with javascript: URL if needed.

    if (banners.length === 0) {
        // Fallback or Empty State
        container.innerHTML = `
            <div class="w-full flex-shrink-0 relative h-full bg-gray-900 border-none">
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                    <h2 class="text-4xl md:text-5xl font-black text-white mb-2">Welcome to Harsh<span class="gradient-text">Edits</span></h2>
                    <p class="text-gray-400">The ultimate resource hub for editors.</p>
                </div>
            </div>`;
        dotsContainer.innerHTML = '';
        return;
    }

    container.innerHTML = '';
    dotsContainer.innerHTML = '';

    banners.forEach((banner, index) => {
        // Create Slide
        const slide = document.createElement('div');
        slide.className = 'w-full flex-shrink-0 relative h-full text-left';

        let buttonHTML = '';
        if (banner.buttonText && banner.buttonURL) {
            let btnUrl = banner.buttonURL;
            let targetAttr = 'target="_blank"';

            if (btnUrl.includes('showEasyWorkflowView')) {
                // Auto-inject the banner ID for dynamic rendering
                btnUrl = `javascript:showEasyWorkflowView('${banner.id}')`;
                targetAttr = '';
            } else if (btnUrl.startsWith('javascript:')) {
                targetAttr = '';
            }

            buttonHTML = `
                <a href="${btnUrl}" ${targetAttr} class="inline-block mt-6 gradient-btn text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform">
                    ${banner.buttonText}
                </a>`;
        }

        slide.innerHTML = `
            <div class="banner-card-container h-full flex items-center justify-center px-8 md:px-16">
                <!-- Single Banner Card with 3D Tilt -->
                <div class="banner-tilt-card w-full max-w-6xl bg-gradient-to-br from-gray-900/95 via-gray-900/90 to-gray-950/95 backdrop-blur-2xl rounded-[2rem] border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.8)] overflow-hidden relative">
                    <!-- Subtle inner glow -->
                    <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none"></div>
                    
                    <div class="flex flex-col md:flex-row items-center gap-0 relative z-10">
                        <!-- Left: Image -->
                        <div class="w-full md:w-[45%] p-6 md:p-8">
                            <div class="relative rounded-2xl overflow-hidden aspect-video bg-gradient-to-br from-indigo-500/10 to-purple-500/10 ring-1 ring-white/10">
                                <img src="${banner.imageURL}" class="w-full h-full object-cover" alt="${banner.title}">
                            </div>
                        </div>
                        
                        <!-- Right: Content -->
                        <div class="flex-1 p-6 md:p-8 md:pr-12">
                            <span class="inline-block px-4 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-400/40 text-xs font-bold text-indigo-300 mb-4 uppercase tracking-widest">${banner.subtitle || 'Featured'}</span>
                            <h2 class="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-3 tracking-tight">${banner.title}</h2>
                            <p class="text-sm md:text-base text-gray-300 leading-relaxed mb-6 line-clamp-2">${banner.description || ''}</p>
                            ${buttonHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(slide);

        // Create Dot
        const dot = document.createElement('button');
        dot.className = `w-2 md:w-3 h-2 md:h-3 rounded-full transition-all duration-300 ${index === 0 ? 'bg-white w-6 md:w-8' : 'bg-white/40 hover:bg-white/70'}`;
        dot.onclick = () => goToSlide(index);
        dot.ariaLabel = `Go to slide ${index + 1}`;
        dotsContainer.appendChild(dot);
    });

    // Initialize 3D Tilt Effect for Banner Images
    initBannerTiltEffect();

    // Initialize logic
    initBannerCarousel(banners.length);
}

function initBannerCarousel(totalSlides) {
    if (totalSlides <= 1) {
        document.getElementById('carousel-prev').classList.add('hidden');
        document.getElementById('carousel-next').classList.add('hidden');
        return; // No need for carousel logic
    }

    const settings = appData.carouselSettings || { autoSlide: true, slideSpeed: 5 };
    const speedMs = (settings.slideSpeed || 5) * 1000;

    // Reset state
    currentSlide = 0;
    updateCarouselUI();

    // Event Listeners
    document.getElementById('carousel-prev').onclick = () => {
        resetAutoSlide();
        prevSlide(totalSlides);
    };
    document.getElementById('carousel-next').onclick = () => {
        resetAutoSlide();
        nextSlide(totalSlides);
    };

    // Auto Slide
    if (settings.autoSlide) {
        startAutoSlide(speedMs, totalSlides);
    }
}

function startAutoSlide(interval, total) {
    clearInterval(carouselInterval);
    const progressBar = document.getElementById('slide-progress-bar');
    if (progressBar) {
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';
        // Force reflow
        void progressBar.offsetWidth;
        progressBar.style.transition = `width ${interval}ms linear`;
        progressBar.style.width = '100%';
    }

    carouselInterval = setInterval(() => {
        nextSlide(total);
        // Reset bar for next loop
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            void progressBar.offsetWidth;
            progressBar.style.transition = `width ${interval}ms linear`;
            progressBar.style.width = '100%';
        }
    }, interval);
}

function resetAutoSlide() {
    clearInterval(carouselInterval);
    const progressBar = document.getElementById('slide-progress-bar');
    if (progressBar) {
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';
    }

    // Restart if enabled
    const settings = appData.carouselSettings || { autoSlide: true, slideSpeed: 5 };
    if (settings.autoSlide) {
        // Small delay before restarting so user can read
        setTimeout(() => startAutoSlide((settings.slideSpeed || 5) * 1000, document.querySelectorAll('#banner-slides > div').length), 2000);
    }
}

function goToSlide(index) {
    const slides = document.querySelectorAll('#banner-slides > div');
    const total = slides.length;
    if (index >= total) index = 0;
    if (index < 0) index = total - 1;

    currentSlide = index;
    updateCarouselUI();
    resetAutoSlide();
}

function nextSlide(total) {
    currentSlide = (currentSlide + 1) % total;
    updateCarouselUI();
}

function prevSlide(total) {
    currentSlide = (currentSlide - 1 + total) % total;
    updateCarouselUI();
}

function updateCarouselUI() {
    const track = document.getElementById('banner-slides');
    const dots = document.querySelectorAll('#carousel-dots button');

    if (track) {
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    dots.forEach((dot, idx) => {
        if (idx === currentSlide) {
            dot.className = 'w-6 md:w-8 h-2 md:h-3 rounded-full bg-white transition-all duration-300';
        } else {
            dot.className = 'w-2 md:w-3 h-2 md:h-3 rounded-full bg-white/40 hover:bg-white/70 transition-all duration-300';
        }
    });

    // Update Background Video State
    checkBannerVideo(currentSlide);
}

function checkBannerVideo(index) {
    const banners = (appData.banners || []).filter(b => b.active).sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentBanner = banners[index];
    const videoEl = document.getElementById('landing-bg-video');
    // Nuclear: Select ALL possible background containers
    const bgAnimEls = document.querySelectorAll('.mesh-background, .aurora-container');

    if (currentBanner && currentBanner.videoBg) {
        console.log('Video ON for banner:', currentBanner.title);

        // Show Video
        if (videoEl) {
            videoEl.classList.remove('hidden');
            requestAnimationFrame(() => {
                videoEl.classList.remove('opacity-0');
                videoEl.play().catch(e => console.warn("Video play blocked", e));
            });
        }

        // Show Animations
        bgAnimEls.forEach(el => {
            el.style.display = 'block';
            void el.offsetWidth; // Force reflow
            el.style.opacity = '1';
            el.style.transition = 'opacity 1s ease';
        });

    } else {
        console.log('Video OFF for banner:', currentBanner ? currentBanner.title : 'None');

        // Hide Video (Ultimate Nuclear)
        if (videoEl) {
            console.log("Force hiding video");
            videoEl.style.transition = 'none';
            videoEl.classList.add('opacity-0');
            videoEl.pause();
            videoEl.style.setProperty('display', 'none', 'important');
            videoEl.classList.add('hidden');
        }

        // Hide Animations (Ultimate Nuclear - Immediate)
        bgAnimEls.forEach(el => {
            console.log("Force hiding animation:", el.className);
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.setProperty('display', 'none', 'important');
        });
    }
}

// 3D Tilt Effect for Banner Cards (Hover-based)
function initBannerTiltEffect() {
    const bannerCards = document.querySelectorAll('.banner-tilt-card');

    bannerCards.forEach(card => {
        let rect = card.getBoundingClientRect();
        let framePending = false;

        const updateRect = () => {
            rect = card.getBoundingClientRect();
        };

        // Update rect on mouseenter and window resize
        card.addEventListener('mouseenter', updateRect);
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, { passive: true }); // Update on scroll too as position changes

        card.addEventListener('mouseenter', () => {
            // Disable transition for instantaneous 1:1 movement (removes lag/fight between JS and CSS)
            card.style.transition = 'none';
        });

        card.addEventListener('mousemove', (e) => {
            if (framePending) return;
            framePending = true;

            const clientX = e.clientX;
            const clientY = e.clientY;

            requestAnimationFrame(() => {
                // Use cached rect
                const x = clientX - rect.left;
                const y = clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -8; // Max 8deg
                const rotateY = ((x - centerX) / centerX) * 8;

                card.style.transform = `perspective(2000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                framePending = false;
            });
        });

        card.addEventListener('mouseleave', () => {
            card.style.transition = 'transform 0.4s ease-out';
            card.style.transform = 'perspective(2000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        });
    });
}

function renderSoftware() {
    const grid = document.getElementById('software-container');
    if (!grid) return;

    if (appData.adobeSoftware.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Adobe Software will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.adobeSoftware.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-indigo-500/30 transition-all duration-500 relative overflow-hidden" onclick="showDetailView('${item.id}')">
                
                ${proBadge}
                <!-- Full Card Hover Tint -->
                <div class="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/5 transition-colors duration-500"></div>

                <!-- Glow Effect (Moved) -->
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-700 pointer-events-none"></div>

                <!-- Heart Button -->
                ${getHeartButtonHTML(item.id, { ...item, type: 'Software' }, 'absolute top-3 right-3 z-20')}

                <!-- Icon Left (Larger) -->
                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'https://placehold.co/100'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <!-- Text Right -->
                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h4 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-indigo-400 transition-colors drop-shadow-md">${item.Title}</h4>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || 'Professional software for creatives.'}</p>
                    
                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>

            </div>
        </div>
    `;
    }).join('');
}

function renderPlugins() {
    const grid = document.getElementById('plugins-container');
    if (!grid) return;

    if (appData.plugins.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Plugins will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.plugins.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-purple-500/30 transition-all duration-500 relative overflow-hidden" onclick="showItemDetail('plugins', '${item.id}')">
                
                ${proBadge}
                <div class="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/5 transition-colors duration-500"></div>
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full group-hover:bg-purple-500/20 transition-all duration-700 pointer-events-none"></div>

                ${getHeartButtonHTML(item.id, { ...item, type: 'Plugins' }, 'absolute top-3 right-3 z-20')}

                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'https://placehold.co/100'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-purple-400 transition-colors drop-shadow-md">${item.Title}</h5>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || ''}</p>
                    
                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderScripts() {
    const grid = document.getElementById('scripts-container');
    if (!grid) return;

    if (appData.scripts.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Scripts will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.scripts.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-teal-500/30 transition-all duration-500 relative overflow-hidden" onclick="showItemDetail('scripts', '${item.id}')">
                
                ${proBadge}
                <div class="absolute inset-0 bg-teal-500/0 group-hover:bg-teal-500/5 transition-colors duration-500"></div>
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-teal-500/10 blur-[80px] rounded-full group-hover:bg-teal-500/20 transition-all duration-700 pointer-events-none"></div>

                ${getHeartButtonHTML(item.id, { ...item, type: 'Scripts' }, 'absolute top-3 right-3 z-20')}

                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'https://placehold.co/100'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-teal-400 transition-colors drop-shadow-md">${item.Title}</h5>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || ''}</p>

                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderAssets() {
    const grid = document.getElementById('assets-container');
    if (!grid) return;

    // Grid class is managed in HTML now (lg:grid-cols-3)

    if (appData.assets.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Assets will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.assets.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-rose-500/30 transition-all duration-500 relative overflow-hidden" onclick="showItemDetail('assets', '${item.id}')">
                
                ${proBadge}
                <div class="absolute inset-0 bg-rose-500/0 group-hover:bg-rose-500/5 transition-colors duration-500"></div>
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-rose-500/10 blur-[80px] rounded-full group-hover:bg-rose-500/20 transition-all duration-700 pointer-events-none"></div>

                ${getHeartButtonHTML(item.id, { ...item, type: 'Assets' }, 'absolute top-3 right-3 z-20')}

                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'https://placehold.co/100'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-rose-400 transition-colors drop-shadow-md">${item.Title}</h5>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || ''}</p>

                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderUtilities() {
    const grid = document.getElementById('utilities-container');
    if (!grid) return;

    if (appData.utilities.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Utilities will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.utilities.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-yellow-500/30 transition-all duration-500 relative overflow-hidden" onclick="showItemDetail('utilities', '${item.id}')">
                
                ${proBadge}
                <div class="absolute inset-0 bg-yellow-500/0 group-hover:bg-yellow-500/5 transition-colors duration-500"></div>
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-yellow-500/10 blur-[80px] rounded-full group-hover:bg-yellow-500/20 transition-all duration-700 pointer-events-none"></div>

                ${getHeartButtonHTML(item.id, { ...item, type: 'Utilities' }, 'absolute top-3 right-3 z-20')}

                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'https://placehold.co/100'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-yellow-400 transition-colors drop-shadow-md">${item.Title}</h5>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || ''}</p>

                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderCourses() {
    const grid = document.getElementById('courses-container');
    if (!grid) return;

    if (appData.courses.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Courses will appear here once you add them via the Admin Panel.</p>';
        return;
    }

    grid.innerHTML = appData.courses.map(item => {
        const proBadge = item.isPro ? `
            <div class="absolute top-3 left-14 z-20 pointer-events-none">
                <span class="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1">
                    <i class="fa-solid fa-crown text-[8px]"></i> PRO
                </span>
            </div>
        ` : '';

        return `
        <div class="interactive-card group" id="card-${item.id}">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-emerald-500/30 transition-all duration-500 relative overflow-hidden" onclick="showItemDetail('courses', '${item.id}')">
                
                ${proBadge}
                <div class="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors duration-500"></div>
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full group-hover:bg-emerald-500/20 transition-all duration-700 pointer-events-none"></div>

                ${getHeartButtonHTML(item.id, { ...item, type: 'Courses' }, 'absolute top-3 right-3 z-20')}

                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${item.ImageURL || 'assets/placeholder.jpg'}" alt="${item.Title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-emerald-400 transition-colors drop-shadow-md">${item.Title}</h5>
                    <p class="text-sm text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">${item.Description || ''}</p>

                    <!-- Meta Badges -->
                    <div class="mt-3 flex items-center gap-2">
                        ${item.Versions && Object.keys(item.Versions).length >= 1 ?
                `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5 backdrop-blur-md">
                            <i class="fa-solid fa-code-branch text-[9px]"></i> ${Object.keys(item.Versions).length} Version${Object.keys(item.Versions).length > 1 ? 's' : ''}
                         </span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderPluginsListTable() {
    const grid = document.getElementById('plugins-list-grid'); // This needs to be in index.html inside plugins-list-view
    if (!grid) return;

    if (appData.simplePluginsList.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-400 py-8">List is empty.</p>`;
        grid.className = 'w-full'; // Reset class for empty message
        return;
    }

    // Apply Grid Classes (Dense 4-column Layout)
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 w-full p-0 overflow-y-auto custom-scrollbar max-h-[60vh] content-start';

    grid.innerHTML = appData.simplePluginsList.map((item, index) => {
        // Create a sanitized ID from the title
        const sanitizedId = 'plugin-list-' + item.Title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const isFav = userFavorites[sanitizedId] ? 'text-red-500' : 'text-gray-600 hover:text-red-400';
        const solidOrRegular = userFavorites[sanitizedId] ? 'fa-solid' : 'fa-regular';

        // Add item data for saving
        const itemDataAttr = encodeURIComponent(JSON.stringify({ ...item, id: sanitizedId, type: 'simple_plugin' }));

        return `
        <div class="flex items-center gap-2 group/item">
             <button onclick="toggleFavorite(this, '${itemDataAttr}')" 
                class="text-xs transition-transform transform active:scale-95 focus:outline-none ${isFav}"
                title="${userFavorites[sanitizedId] ? 'Remove from Favorites' : 'Add to Favorites'}">
                <i class="${solidOrRegular} fa-heart"></i>
            </button>
            <a href="#" onclick="handleDownloadSecure('${btoa(item.DownloadLink)}', '${item.Title.replace(/'/g, "\\'")}', ${item.isPro || false}, ${item.price || 0}, '${item.id}'); return false;" 
               id="${sanitizedId}" 
               data-plugin-title="${item.Title}"
               class="block text-indigo-400 hover:text-indigo-300 transition-colors truncate text-sm font-medium py-1 flex-1 flex items-center gap-1.5" 
               title="${item.Title}">
                ${item.isPro ? '<i class="fa-solid fa-crown text-[9px] text-yellow-500"></i>' : ''}
                ${item.Title}
            </a>
        </div>
    `;
    }).join('');
}

// --- Logic & View Management ---
let mainView, softwareDetailView, itemDetailView, pluginsListView, easyWorkflowView, atomxPacksView, favoritesView;

function hideAllViews(except) {
    const views = [mainView, softwareDetailView, itemDetailView, pluginsListView, easyWorkflowView, atomxPacksView, favoritesView];
    views.forEach(view => {
        if (view && view !== except) view.classList.add('hidden');
    });
}

function transitionToView(targetView, setupFn) {
    if (document.body.classList.contains('is-transitioning')) return;
    document.body.classList.add('is-transitioning', 'is-leaving');
    const currentView = document.querySelector('.page-view:not(.hidden)');

    setTimeout(() => {
        if (currentView) {
            currentView.classList.add('hidden');
            currentView.style.animation = '';
        }
        if (setupFn) setupFn();
        if (targetView) {
            hideAllViews(targetView);
            targetView.classList.remove('hidden');
            targetView.style.animation = 'slideIn 0.5s ease-out forwards';
        }
        window.scrollTo(0, 0);
        document.body.classList.remove('is-leaving');
        setTimeout(() => {
            document.body.classList.remove('is-transitioning');
        }, 500);
    }, 400);
}

// Universal Banner Detail View (formerly showEasyWorkflowView)
window.showEasyWorkflowView = function (bannerId) {
    if (!bannerId) {
        console.error("No banner ID provided to showEasyWorkflowView");
        return;
    }

    const banner = (appData.banners || []).find(b => b.id === bannerId);
    if (!banner) {
        console.error("Banner not found match for id:", bannerId);
        return;
    }

    const detail = banner.detailView || {};

    // Populate Dynamic Content
    document.getElementById('ew-dynamic-title').textContent = detail.title || banner.title;
    document.getElementById('ew-dynamic-subtitle').textContent = detail.subtitle || banner.subtitle || '';
    document.getElementById('ew-dynamic-description').textContent = detail.description || banner.description || '';

    // Versions
    const versionsContainer = document.getElementById('ew-dynamic-versions');
    versionsContainer.innerHTML = ''; // Reset

    if (detail.versions && Array.isArray(detail.versions) && detail.versions.length > 0) {
        detail.versions.forEach((v, index) => {
            const card = document.createElement('div');
            card.className = "glass-card p-6 flex flex-col sm:flex-row justify-between items-center gap-4";
            card.innerHTML = `
                <span class="font-semibold text-white text-xl">${v.name}</span>
                <a href="#" onclick="handleDownloadSecure('${btoa(v.link)}', '${v.name.replace(/'/g, "\\'")}', ${detail.isPro || banner.isPro || false}, ${(detail.price || banner.price || 0)}, '${detail.id || banner.id}'); return false;"
                    class="w-full sm:w-auto gradient-btn text-white font-bold py-3 px-8 rounded-full text-center flex items-center justify-center gap-2 hover:scale-105 transition-transform">
                    ${(detail.isPro || banner.isPro) ? '<i class="fa-solid fa-crown"></i>' : '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>'}
                    Download Now
                </a>
            `;
            versionsContainer.appendChild(card);
        });
    } else {
        // Fallback if no versions defined (Show default or nothing)
        versionsContainer.innerHTML = `<p class="text-gray-400 text-center">No download versions available.</p>`;
    }

    // Control Workflow Background Video
    const workflowVideoEl = document.getElementById('easy-workflow-bg-video');
    if (workflowVideoEl) {
        if (banner.workflowVideoBg) {
            console.log('Workflow video ON for banner:', banner.title);
            workflowVideoEl.classList.remove('hidden');
            workflowVideoEl.style.display = 'block';
            workflowVideoEl.style.opacity = '0.2';
            workflowVideoEl.play().catch(e => console.warn("Workflow video play blocked", e));
        } else {
            console.log('Workflow video OFF for banner:', banner.title);
            workflowVideoEl.pause();
            workflowVideoEl.style.setProperty('display', 'none', 'important');
            workflowVideoEl.classList.add('hidden');
        }
    }

    transitionToView(easyWorkflowView);
}

// Unified Detail View Proxy
window.showDetailView = function (id, fromContext = null) {
    // Adobe Software uses 'adobeSoftware' collection in appData
    // We reuse the universal modal by calling showItemDetail
    showItemDetail('adobeSoftware', id, fromContext);
};

window.showItemDetail = function (collectionName, id, fromContext = null, preserveScroll = false) {
    isFromFavorites = (fromContext === 'favorites');

    // Save current scroll position before opening modal (unless we're preserving the existing one)
    if (!preserveScroll) {
        window.savedModalScrollPosition = window.scrollY;
    }

    const modal = document.getElementById('item-detail-view');

    // --- MODAL LOGIC START ---
    if (collectionName) window.lastViewedSection = collectionName;

    // Freeze Background
    document.body.style.overflow = 'hidden';

    // Apply blur to background (alternative to backdrop-filter)
    const mainView = document.getElementById('main-view');
    const header = document.getElementById('header');
    const favoritesView = document.getElementById('favorites-view');
    if (mainView) mainView.style.filter = 'blur(16px)';
    if (header) header.style.filter = 'blur(16px)';
    if (favoritesView) favoritesView.style.filter = 'blur(16px)';

    modal.classList.remove('hidden');

    // Ensure animation plays
    modal.style.animation = 'none';
    modal.offsetHeight; /* trigger reflow */
    modal.style.animation = 'modalPopIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    // --- MODAL LOGIC END ---

    if (!appData[collectionName]) {
        console.error(`showItemDetail Error: Invalid collection '${collectionName}'.`);
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (mainView) mainView.style.filter = 'none';
        if (header) header.style.filter = 'none';
        if (favoritesView) favoritesView.style.filter = 'none';
        return;
    }

    const item = appData[collectionName].find(x => x.id === id);
    if (!item) {
        console.error(`showItemDetail Error: Could not find item with id '${id}' in collection '${collectionName}'.`);
        // We must close the modal we just opened so it doesn't show stale data
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (mainView) mainView.style.filter = 'none';
        if (header) header.style.filter = 'none';
        if (favoritesView) favoritesView.style.filter = 'none';

        // Use custom alert if available, else standard alert
        if (typeof showAlert === 'function') {
            showAlert('Sorry, this resource could not be found. It may have been removed or updated.', 'Resource Not Found', 'error');
        } else {
            alert('Sorry, this resource could not be found.');
        }
        return;
    }

    // Populate Images & Text
    const img = item.ImageURL || 'assets/3d-extruder.png'; // Fallback
    document.getElementById('item-detail-image').src = img;
    document.getElementById('item-detail-title').textContent = item.Title;
    // Use download description if available, otherwise use regular description
    const descriptionText = item.DownloadDescription || "No description available.";
    document.getElementById('item-detail-description').textContent = descriptionText;

    // Update Badge with dynamic colors
    const typeBadge = document.getElementById('item-detail-type');

    // Define badge text and colors for each collection
    const badgeConfig = {
        'adobeSoftware': { text: 'Software', bgColor: 'bg-indigo-500/20', textColor: 'text-indigo-300', borderColor: 'border-indigo-500/40' },
        'plugins': { text: 'Plugin', bgColor: 'bg-purple-500/20', textColor: 'text-purple-300', borderColor: 'border-purple-500/40' },
        'scripts': { text: 'Script/Extension', bgColor: 'bg-teal-500/20', textColor: 'text-teal-300', borderColor: 'border-teal-500/40' },
        'assets': { text: 'Asset Pack', bgColor: 'bg-rose-500/20', textColor: 'text-rose-300', borderColor: 'border-rose-500/40' },
        'utilities': { text: 'Utility', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-300', borderColor: 'border-yellow-500/40' },
        'courses': { text: 'Course', bgColor: 'bg-emerald-500/20', textColor: 'text-emerald-300', borderColor: 'border-emerald-500/40' }
    };

    const config = badgeConfig[collectionName] || { text: 'Resource', bgColor: 'bg-white/10', textColor: 'text-white', borderColor: 'border-white/10' };

    typeBadge.textContent = config.text;
    typeBadge.className = `px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest backdrop-blur-md border shadow-lg ${config.bgColor} ${config.textColor} ${config.borderColor}`;

    // Actions Logic
    const versionsGrid = document.getElementById('item-versions-grid');
    const singleActionDiv = document.getElementById('item-single-action');
    const extraActionsContainer = document.getElementById('item-extra-actions');

    // Reset
    versionsGrid.innerHTML = '';
    extraActionsContainer.innerHTML = '';
    singleActionDiv.classList.add('hidden');
    versionsGrid.classList.remove('hidden');

    // Special Case: AtomX
    if (item.Title.toLowerCase().includes('atomx')) {
        extraActionsContainer.innerHTML = `
                <div class="mt-4 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/30 text-center">
                    <p class="text-indigo-300 text-sm font-semibold mb-3">Looking for AtomX Packs?</p>
                    <button onclick="showAtomXPacksView()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">
                        View Mega Pack Collection
                    </button>
                </div>`;
    }

    // Versions vs Single Link Logic
    const versions = item.Versions || [];

    if (versions.length > 0) {
        // Render Versions List
        versionsGrid.style.display = 'flex';
        versions.forEach((version, versionIndex) => {
            const vName = version.Name || 'Latest';
            const vLink = version.Link || '#';
            const vDesc = version.Description ? `<span class="text-xs text-gray-500 ml-2">(${version.Description})</span>` : '';

            versionsGrid.insertAdjacentHTML('beforeend', `
                    <div class="flex items-center justify-between p-4 bg-[#18181b] hover:bg-[#27272a] rounded-xl border border-white/5 transition-all group duration-300">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            </div>
                            <div>
                                <span class="block font-bold text-white text-sm tracking-wide">${vName}</span>
                                ${vDesc ? `<span class="block text-xs text-gray-500 mt-0.5">${version.Description}</span>` : '<span class="block text-xs text-gray-500 mt-0.5">Secure Download</span>'}
                            </div>
                        </div>
                        <a href="#" onclick="handleDownloadSecure('${btoa(vLink)}', '${vName.replace(/'/g, "\\'")}', ${item.isPro || false}, ${item.price || 0}, '${item.id}'); return false;" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-5 rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center gap-2">
                            ${item.isPro ? '<i class="fa-solid fa-crown text-[10px]"></i>' : '<i class="fa-solid fa-download"></i>'}
                            Download
                        </a>
                    </div>
                `);
        });
    } else {
        // Render Single Download Button (Assets, Courses, etc)
        versionsGrid.style.display = 'none';
        singleActionDiv.classList.remove('hidden');
        const btn = document.getElementById('item-download-btn');
        btn.onclick = (e) => { e.preventDefault(); handleDownloadSecure(btoa(item.DownloadLink || '#'), item.Title, item.isPro || false, item.price || 0, item.id); };
        btn.href = '#';
        if (!item.DownloadLink) {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.querySelector('span').textContent = 'Download Not Available'; // This span target might need checking if structure changed
            // With new structure, span is inside div.text-left. Let's act safer by resetting HTML content of button text area
            const textContainer = btn.querySelector('.text-left');
            if (textContainer) {
                textContainer.innerHTML = '<span class="block text-lg">Unavailable</span><span class="block text-xs text-white/70 font-normal">Check back later</span>';
            }
        } else {
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            const textContainer = btn.querySelector('.text-left');
            if (textContainer) {
                textContainer.innerHTML = '<span class="block text-lg">Download Now</span><span class="block text-xs text-white/70 font-normal">Direct Link • High Speed</span>';
            }
        }
    }

    // Store current item context for sub-items navigation
    window.currentItemCollection = collectionName;
    window.currentItemId = id;

    // Check if item has sub-items and show button
    const subItemsActionDiv = document.getElementById('item-sub-items-action');
    const subItemsBtn = document.getElementById('item-sub-items-btn');
    const subItemsBtnText = document.getElementById('item-sub-items-btn-text');

    if (subItemsActionDiv && item.hasSubItems) {
        // Show sub-items button
        subItemsActionDiv.classList.remove('hidden');

        // Update button text if custom text is provided
        if (subItemsBtnText && item.subItemsButtonText) {
            subItemsBtnText.textContent = item.subItemsButtonText;
        } else if (subItemsBtnText) {
            subItemsBtnText.textContent = 'View All Resources';
        }
    } else if (subItemsActionDiv) {
        // Hide sub-items button if no sub-items
        subItemsActionDiv.classList.add('hidden');
    }

    // Add Report Broken Link Button
    const reportBtn = document.createElement('button');
    reportBtn.className = 'w-full mt-3 flex items-center justify-center gap-2 text-red-400 hover:text-red-300 transition-colors text-sm py-2 px-4 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20';
    reportBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Report Broken Link
        `;

    // Map collectionName to Display Name
    const categoryMap = {
        'adobeSoftware': 'Adobe Software',
        'plugins': 'Plugins',
        'scripts': 'Scripts & Extensions',
        'assets': 'Assets',
        'courses': 'Courses',
        'utilities': 'Utilities'
    };
    const displayCategory = categoryMap[collectionName] || collectionName;

    reportBtn.onclick = () => openReportModal(item.Title, displayCategory);

    // Append to Extra Actions (ensuring it's always visible)
    extraActionsContainer.appendChild(reportBtn);
};

// 1. Helper to Generate Heart Button HTML
function getHeartButtonHTML(itemId, itemData, extraClasses = 'absolute top-4 right-4 z-10') {
    const isFav = userFavorites[itemId];
    const iconClass = isFav ? 'fa-solid text-red-500' : 'fa-regular text-gray-400 hover:text-white';
    // Encode item data safely
    const dataStr = encodeURIComponent(JSON.stringify(itemData || {}));

    return `
        <button onclick="toggleFavorite(this, '${dataStr}')" onmousemove="event.stopPropagation()" data-id="${itemId}" 
            class="${extraClasses} w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 focus:outline-none ring-1 ring-white/10 hover:ring-white/30 z-50"
            title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
            <i class="${iconClass} fa-heart text-lg"></i>
        </button>
    `;
}

window.showPluginsList = function () {
    transitionToView(pluginsListView, () => {
        renderPluginsListTable(); // Render dynamic list if we have container
    });
}

// Donation Logic
// ==================== Razorpay & Paywall Logic ====================
window.processPayment = function (customAmount = null, itemId = null, itemTitle = null) {
    if (!currentUser) {
        window.location.href = 'auth.html#signup';
        return;
    }

    // Use dynamic proPrice if no custom amount provided
    // Ensure it's a valid integer (Razorpay expects amount in smallest currency unit)
    let finalAmount = customAmount !== null ? customAmount : Math.round(parseFloat(proPrice) * 100);

    // Safety check: Never allow 0 or NaN amount
    if (!finalAmount || finalAmount <= 0 || isNaN(finalAmount)) {
        console.error("Invalid payment amount:", { proPrice, finalAmount });
        showAlert("Invalid payment amount. Please contact support.", "Configuration Error", "error");
        return;
    }

    const description = itemId ? `Access to: ${itemTitle}` : "Lifetime Pro Access Bundle";

    console.log("Initiating Razorpay on domain:", window.location.origin, { amount: finalAmount, currency: rzpCurrency, key: rzpKey });

    // Razorpay Configuration
    const options = {
        "key": rzpKey,
        "amount": finalAmount,
        "currency": rzpCurrency,
        "name": "SoftwhereHub",
        "description": description,
        "image": "assets/logo.png",
        "payment_capture": 1, 
        "handler": function (response) {
            if (response.razorpay_payment_id) {
                let updateData = {
                    paymentId: response.razorpay_payment_id,
                    paidAt: firebase.database.ServerValue.TIMESTAMP
                };

                if (itemId) {
                    // Record individual purchase
                    updateData[`purchased/${itemId}`] = true;
                } else {
                    // Global Pro Access
                    updateData.isPaid = true;
                }

                const finalUpdate = db.ref('users/' + currentUser.uid).update(updateData);

                // Record Transaction Log for Admin Audit
                const transactionData = {
                    uid: currentUser.uid,
                    email: currentUser.email || 'N/A',
                    userName: currentUser.displayName || 'N/A',
                    amount: finalAmount / 100,
                    currency: rzpCurrency,
                    itemId: itemId || 'PRO_BUNDLE',
                    itemTitle: itemTitle || 'Lifetime Pro Access',
                    paymentId: response.razorpay_payment_id,
                    type: itemId ? 'individual' : 'pro_membership',
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };

                const transactionLog = db.ref('transactions').push(transactionData);

                // Activities log
                const activityLog = db.ref('activities').push({
                    type: 'Payment',
                    user: currentUser.email,
                    detail: `Paid ${rzpCurrency} ${transactionData.amount} for ${transactionData.itemTitle}`,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });

                // Show success UI
                showSuccessModal();
                unlockWebsite();

                // Ensure data is synced but don't block UI
                Promise.all([finalUpdate, transactionLog, activityLog]).catch(err => {
                    console.error("Error logging transaction:", err);
                    // Silently fail logging if necessary, but user is already upgraded
                });
            }
        },
        "prefill": {
            "name": currentUser.displayName || "",
            "email": currentUser.email || "",
            "contact": ""
        },
        "theme": {
            "color": "#4f46e5"
        }
    };

    const rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
        showAlert("Payment Failed: " + response.error.description, "Transaction Error", "error");
    });
    rzp1.open();
}

window.checkPaywall = function () {
    // No longer locking the site on entry as per new request
    // checkPaywall is now used internally or on specific pages if needed
}

function lockWebsite() {
    // Keep for legacy calls, but won't be used for full-site lock
}

function unlockWebsite() {
    const overlay = document.getElementById('paywall-overlay');
    if (overlay) {
        overlay.classList.add('pointer-events-none');
        overlay.classList.remove('opacity-100');
        document.body.style.overflow = '';
    }
}

function showSuccessModal() {
    const modal = document.getElementById('payment-success-modal');
    if (modal) {
        modal.classList.remove('pointer-events-none');
        modal.classList.add('opacity-100');
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('payment-success-modal');
    if (modal) {
        modal.classList.add('pointer-events-none');
        modal.classList.remove('opacity-100');
    }
}


// 8. Navigation & Views
window.showFavoritesView = function () {
    if (!currentUser) {
        showAlert(
            'You must be signed in to access your favorites.',
            'Access Restricted',
            'error',
            () => {
                // Redirect on OK
                window.location.href = 'auth.html#signup';
            },
            'Sign Up',
            () => {
                // Optional: Action on cancel (just close modal is default)
            }
        );
        return;
    }
    const favView = document.getElementById('favorites-view');
    favoritesView = favView; // Global ref
    transitionToView(favoritesView, () => {
        renderFavoritesPage();
    });
}

// ==================== FAVORITES SYSTEM ====================

// 2. Inject Hearts into Static HTML Content (100+ Packs)
function initStaticHeartIcons() {
    const staticContainers = document.querySelectorAll('#other-plugins .interactive-card .glass-card');

    staticContainers.forEach((card, index) => {
        // Prevent double injection
        if (card.querySelector('.fav-btn-static')) return;

        // Scrape Data
        const titleEl = card.querySelector('h5');
        const title = titleEl ? titleEl.innerText.trim() : 'Unknown Item';
        const linkEl = card.querySelector('a[href*="drive.google"]');
        const downloadLink = linkEl ? linkEl.href : '#';
        const imgEl = card.querySelector('img'); // Likely none in this specific section, but generic support
        const image = imgEl ? imgEl.src : '';

        // Generate ID
        const id = 'static-pack-' + index + '-' + title.toLowerCase().replace(/[^a-z0-9]/g, '-');

        const itemData = {
            id: id,
            Title: title,
            DownloadLink: downloadLink,
            ImageURL: image,
            type: 'static_pack'
        };

        const btnHTML = getHeartButtonHTML(id, itemData, 'absolute top-3 right-3 z-20 fav-btn-static');
        card.style.position = 'relative';
        card.insertAdjacentHTML('beforeend', btnHTML);
    });
}

// 3. Toggle Favorite Action
window.toggleFavorite = async function (btn, itemDataEncoded) {
    // Stop propagation to prevent card click (if inside interactive card)
    if (event) event.stopPropagation();

    if (!currentUser) {
        showToast('Please sign in to save favorites.', 'info');
        return;
    }

    // Add Burst Animation Class
    btn.classList.add('heart-burst');
    setTimeout(() => btn.classList.remove('heart-burst'), 400);

    try {
        let itemData;
        if (typeof itemDataEncoded === 'string') {
            itemData = JSON.parse(decodeURIComponent(itemDataEncoded));
        } else {
            // Fallback or verify
            itemData = itemDataEncoded;
        }

        const favoritesRef = db.ref(`users/${currentUser.uid}/favorites/${itemData.id}`);
        const snapshot = await favoritesRef.once('value');

        if (snapshot.exists()) {
            // Remove
            await favoritesRef.remove();
            delete userFavorites[itemData.id];
            updateIconState(btn, false);
            showToast('Removed from Favorites', 'info');

            // If on favorites page, refresh
            if (!document.getElementById('favorites-view').classList.contains('hidden')) {
                renderFavoritesPage();
            }
        } else {
            // Save
            await favoritesRef.set({
                id: itemData.id,
                title: itemData.Title || itemData.title || 'Unknown',
                image: itemData.ImageURL || itemData.image || '',
                downloadLink: itemData.DownloadLink || itemData.downloadLink || '#',
                type: itemData.type || 'unknown',
                savedAt: firebase.database.ServerValue.TIMESTAMP
            });
            userFavorites[itemData.id] = true;
            updateIconState(btn, true);
            showToast('Added to Favorites', 'success');
        }
    } catch (err) {
        console.error('Error toggling favorite:', err);
        showToast('Could not update favorite.', 'error');
    }
};

function updateIconState(btn, isFav) {
    const icon = btn.querySelector('i');
    if (isFav) {
        icon.classList.remove('fa-regular', 'text-gray-400', 'text-gray-600');
        icon.classList.add('fa-solid', 'text-red-500');
    } else {
        icon.classList.remove('fa-solid', 'text-red-500');
        icon.classList.add('fa-regular', 'text-gray-400'); // Default styling
    }
}

// 4. Update All Icons on Load
function updateFavoriteIcons() {
    if (!userFavorites) return;

    // Update all buttons with data-id
    document.querySelectorAll('button[data-id]').forEach(btn => {
        const id = btn.dataset.id;
        updateIconState(btn, !!userFavorites[id]);
    });
}

// 5. Render Favorites Page
function renderFavoritesPage() {
    const grid = document.getElementById('favorites-grid');
    const emptyState = document.getElementById('favorites-empty-state');

    if (!grid) return;
    grid.innerHTML = '';

    const favorites = Object.values(userFavorites || {}); // Logic might need adjustment as userFavorites is just IDs in simple cache? 
    // Wait, userFavorites is initialized as full values in fetchData? 
    // Ah, in fetchData I did userFavorites = snap.val(). snap.val() returns object of objects { id1: {data}, id2: {data} }
    // So Object.values is correct.

    // IMPORTANT: Initially userFavorites might just be ids if I optimized. 
    // But checking fetchData: I store proper object there. So this is fine.

    // Correction: In toggle logic I update local cache `userFavorites[itemData.id] = true`. 
    // This is inconsistent. I should store full object in cache or result fetch.
    // Let's refactor fetchData to store full object, and toggle to store full object.

    // RE-FETCHING for page render to be safe/fresh
    if (!currentUser) return;

    // Use userApp database for favorites
    db.ref(`users/${currentUser.uid}/favorites`).once('value').then(snap => {
        const favs = snap.val();

        if (!favs || Object.keys(favs).length === 0) {
            emptyState.classList.remove('hidden');
            grid.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        grid.classList.remove('hidden');

        Object.values(favs).forEach(item => {
            // Determine generic image if missing
            let img = item.image;
            if (!img || img === 'undefined') {
                if (item.title.toLowerCase().includes('plugin')) img = 'assets/placeholder_plugin.jpg'; // fictitious
                else img = 'https://placehold.co/400x300/1e1e2e/indigo?text=' + encodeURIComponent(item.title);
            }

            const dataStr = encodeURIComponent(JSON.stringify(item));
            const type = item.type || 'Resource';
            let clickAction = '';
            // Determine action based on type
            // Determine action based on type
            if (type === 'Software') clickAction = `showDetailView('${item.id}', 'favorites')`;
            else if (type === 'Plugins') clickAction = `showItemDetail('plugins', '${item.id}', 'favorites')`;
            else if (type === 'Scripts') clickAction = `showItemDetail('scripts', '${item.id}', 'favorites')`;
            else if (type === 'Assets') clickAction = `showItemDetail('assets', '${item.id}', 'favorites')`;
            else if (type === 'Utilities') clickAction = `showItemDetail('utilities', '${item.id}', 'favorites')`;
            else if (type === 'Courses') clickAction = `showItemDetail('courses', '${item.id}', 'favorites')`;
            else if (type === 'simple_plugin' || type === 'static_pack') clickAction = `window.open('${item.downloadLink || item.DownloadLink}', '_blank')`;

            const cursorClass = clickAction ? 'cursor-pointer' : '';

            // Download Button Logic: Secured via Base64 handleDownloadSecure
            const encodedItemLink = btoa(item.downloadLink || item.DownloadLink || '#');
            let downloadAttributes = `href="#" onclick="handleDownloadSecure('${encodedItemLink}', '${item.title.replace(/'/g, "\\'")}', ${item.isPro || false}, ${item.price || 0}, '${item.id}'); event.stopPropagation(); return false;"`;
            if (clickAction) {
                downloadAttributes = `href="#" onclick="${clickAction}; event.stopPropagation(); return false;"`;
            }

            // Determine theme color based on type
            let themeColor = 'indigo';
            if (type === 'Plugins') themeColor = 'purple';
            else if (type === 'Scripts') themeColor = 'teal';
            else if (type === 'Assets') themeColor = 'rose';
            else if (type === 'Utilities') themeColor = 'yellow';
            else if (type === 'Courses') themeColor = 'emerald';

            grid.insertAdjacentHTML('beforeend', `
        <div class="interactive-card group">
            <div class="ios-glass-card p-4 h-full flex items-center gap-6 cursor-pointer shadow-lg shadow-black/60 hover:shadow-${themeColor}-500/30 transition-all duration-500 relative overflow-hidden" onclick="${clickAction}">
                
                <!-- Full Card Hover Tint -->
                <div class="absolute inset-0 bg-${themeColor}-500/0 group-hover:bg-${themeColor}-500/5 transition-colors duration-500"></div>

                <!-- Glow Effect -->
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-${themeColor}-500/10 blur-[80px] rounded-full group-hover:bg-${themeColor}-500/20 transition-all duration-700 pointer-events-none"></div>

                <!-- Floating Favorite Action -->
                <button onclick="toggleFavorite(this, '${dataStr}'); event.stopPropagation();" data-id="${item.id}" 
                    class="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm text-red-500 flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg border border-white/10 ring-1 ring-white/10 hover:ring-white/30">
                    <i class="fa-solid fa-heart text-sm"></i>
                </button>

                <!-- Icon Left -->
                <div class="w-24 h-24 rounded-2xl bg-[#050505] border border-white/5 p-0 flex-shrink-0 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative z-10 overflow-hidden ring-1 ring-white/5">
                    <img src="${img}" alt="${item.title}" loading="lazy" class="w-full h-full object-cover">
                </div>

                <!-- Text Right -->
                <div class="flex-1 relative z-10 min-w-0 pr-8">
                    <h5 class="text-2xl font-bold text-white mb-2 truncate group-hover:text-${themeColor}-400 transition-colors drop-shadow-md">${item.title}</h5>
                    <p class="text-xs font-bold uppercase tracking-widest text-${themeColor}-400 mb-1 opacity-80">${type}</p>
                </div>
            </div>
        </div>
             `);
        });

        initEffects(); // Re-init hover effects
    });
}

// Global Alert Helper
// Global Alert Helper
window.showAlert = function (message, title = 'Notice', type = 'info', onOk = null, btnText = 'OK', onCancel = null) {
    const modal = document.getElementById('custom-alert-modal');
    if (!modal) return alert(message);

    const titleEl = modal.querySelector('.modal-title');
    const msgEl = modal.querySelector('.modal-message');
    const iconContainer = modal.querySelector('.modal-icon');
    const okBtn = modal.querySelector('.modal-btn-primary');
    const cancelBtn = modal.querySelector('.modal-btn-cancel');

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = btnText;

    // Handle Cancel Button Logic
    if (onCancel || (btnText === 'Sign In')) { // Heuristic: enable cancel if it's an action prompt
        if (cancelBtn) {
            cancelBtn.classList.remove('hidden');
            // Clear legacy listeners
            const newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

            newCancel.addEventListener('click', () => {
                modal.classList.add('hidden');
                if (onCancel) onCancel();
            });
        }
    } else {
        if (cancelBtn) cancelBtn.classList.add('hidden');
    }

    // Reset Icon
    iconContainer.className = 'modal-icon w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-4';
    iconContainer.innerHTML = '';

    if (type === 'success') {
        iconContainer.classList.add('border-green-500', 'text-green-500');
        iconContainer.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (type === 'error') {
        iconContainer.classList.add('border-red-500', 'text-red-500');
        iconContainer.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
    } else {
        iconContainer.classList.add('border-indigo-500', 'text-indigo-500');
        iconContainer.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    modal.classList.remove('hidden');

    // Remove old listeners to prevent stacking
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);

    const handleOk = () => {
        modal.classList.add('hidden');
        if (onOk) onOk();
    };
    newBtn.addEventListener('click', handleOk);
};

window.hideDonationPopup = function () {
    const popup = document.getElementById('donation-popup');
    if (popup) {
        popup.classList.remove('visible');
        setTimeout(() => popup.classList.add('hidden'), 500);
    }
}

// UI Effects & Init
function initEffects() {
    document.querySelectorAll('.glass-card').forEach(card => {
        let framePending = false;
        card.addEventListener('mousemove', (e) => {
            if (framePending) return;
            framePending = true;
            const clientX = e.clientX;
            const clientY = e.clientY;

            requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const x = clientX - rect.left;
                const y = clientY - rect.top;
                card.style.setProperty('--x', `${x}px`);
                card.style.setProperty('--y', `${y}px`);
                framePending = false;
            });
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

    document.querySelectorAll('.interactive-card').forEach(cardContainer => {
        const card = cardContainer.querySelector('.glass-card');
        if (!card) return;

        let rect = cardContainer.getBoundingClientRect();
        let framePending = false;

        const updateRect = () => {
            rect = cardContainer.getBoundingClientRect();
        };

        cardContainer.addEventListener('mouseenter', () => {
            updateRect();
            card.style.transition = 'none';
        });
        // We don't need global resize/scroll listeners for every single card (too expensive)
        // 'mouseenter' is sufficient as users usually move mouse into card to trigger effect

        cardContainer.addEventListener('mousemove', (e) => {
            if (framePending) return;
            framePending = true;
            const clientX = e.clientX;
            const clientY = e.clientY;

            requestAnimationFrame(() => {
                // Use cached rect
                const width = rect.width;
                const height = rect.height;
                // Recalculate x/y based on cached rect + client pos. 
                // Note: If page scrolled while mouse was *inside* card without leaving/entering, this might drift slightly, 
                // but for small cards it's usually fine. For 100% accuracy we'd need scroll listener, but that's heavy for 50+ cards.
                // Compromise: Re-read rect if it seems way off? No, rely on mouseenter update.

                const x = clientX - rect.left - width / 2;
                const y = clientY - rect.top - height / 2;
                const rotateY = (x / (width / 2)) * 10;
                const rotateX = (-y / (height / 2)) * 10;

                card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
                framePending = false;
            });
        });
        cardContainer.addEventListener('mouseleave', () => {
            requestAnimationFrame(() => {
                // Re-enable transition for smooth snap-back
                card.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
                card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            });
        });
    });

    document.querySelectorAll('.gradient-btn').forEach(btn => {
        btn.onmouseenter = (e) => {
            const rect = btn.getBoundingClientRect();
            for (let i = 0; i < 15; i++) createParticle(btn, e.clientX - rect.left, e.clientY - rect.top);
        };
    });
}

function createParticle(container, x, y) {
    const particle = document.createElement('span');
    particle.classList.add('particle');
    container.appendChild(particle);
    const size = Math.floor(Math.random() * 6 + 3);
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${x - size / 2}px`;
    particle.style.top = `${y - size / 2}px`;
    particle.style.setProperty('--x', `${(Math.random() - 0.5) * 100}px`);
    particle.style.setProperty('--y', `${(Math.random() - 0.5) * 100}px`);
    particle.addEventListener('animationend', () => particle.remove());
}

function initSearch() {
    const searchInput = document.getElementById('search-input');
    const suggestionsDropdown = document.getElementById('search-suggestions-dropdown');
    const noResultsMessage = document.getElementById('no-results-message');

    if (!searchInput) return;

    // 1. Build Index using global appData
    // We rebuild this on focus/input to ensure we catch late-loaded data if needed, 
    // or we can build it once. For now, let's build lazily or check if empty.
    let searchIndex = [];

    function buildIndex() {
        searchIndex = []; // Clear
        const categories = [
            { key: 'adobeSoftware', label: 'Software', icon: '🖥️' },
            { key: 'plugins', label: 'Plugins', icon: '⚡' },
            { key: 'scripts', label: 'Scripts', icon: '📜' },
            { key: 'assets', label: 'Assets', icon: '🎨' },
            { key: 'utilities', label: 'Utilities', icon: '🛠️' },
            { key: 'courses', label: 'Courses', icon: '🎓' },
            { key: 'simplePluginsList', label: 'Extra Plugins', icon: '🔌' } // Added 100+ Pack
        ];

        categories.forEach(cat => {
            if (appData[cat.key]) {
                appData[cat.key].forEach(item => {
                    searchIndex.push({
                        title: item.Title,
                        category: cat.label,
                        catKey: cat.key,
                        icon: cat.icon,
                        id: item.id,
                        image: item.ImageURL,
                        url: item.DownloadLink, // For Extra Plugins direct access
                        isExternal: cat.key === 'simplePluginsList' // Flag for direct link
                    });
                });
            }
        });
    }

    // Levenshtein Distance for Fuzzy Search
    function levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1  // deletion
                        )
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    // 2. Setup Existing "In-Page" Filtering
    document.querySelectorAll('#windows-content section').forEach(section => {
        const sectionTitle = section.querySelector('h3') ? section.querySelector('h3').innerText : '';
        const cards = section.querySelectorAll('.glass-card, li, .interactive-card');
        cards.forEach(card => {
            const searchText = (sectionTitle + ' ' + card.innerText).toLowerCase();
            card.setAttribute('data-searchable-item', searchText);
        });
    });

    let activeSuggestionIndex = -1;

    // 3. Event Listeners

    // Debounce function to prevent lag while typing
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    const debouncedSearch = debounce((e) => {
        const rawQuery = e.target.value.toLowerCase().trim();

        // Ensure index is ready
        if (searchIndex.length === 0) buildIndex();

        // A. Run In-Page Filtering
        handleInPageFiltering(rawQuery);

        // B. Advanced Token-Based Fuzzy Search

        if (rawQuery.length > 0) {
            const queryTokens = rawQuery.split(/\s+/); // Split by whitespace

            let matches = searchIndex.map(item => {
                const title = item.title.toLowerCase();
                const titleTokens = title.split(/[\s-]+/); // Split by space or dash

                let totalScore = 0;
                let matchedTokensCount = 0;

                // Check each query token against title tokens
                queryTokens.forEach(qToken => {
                    let bestTokenScore = 0;

                    titleTokens.forEach(tToken => {
                        let currentScore = 0;

                        // 1. Exact Token Match
                        if (tToken === qToken) {
                            currentScore = 100;
                        }
                        // 2. Starts With (Prefix)
                        else if (tToken.startsWith(qToken)) {
                            currentScore = 80;
                        }
                        // 3. Fuzzy Match (Levenshtein) for longer words
                        else if (qToken.length > 3) {
                            const dist = levenshteinDistance(qToken, tToken);
                            const maxLen = Math.max(qToken.length, tToken.length);
                            // Allow 1 mistake for 4-5 chars, 2 for longer
                            if (dist <= 2 && (dist / maxLen) < 0.4) {
                                currentScore = 60 - (dist * 10);
                            }
                        }

                        if (currentScore > bestTokenScore) bestTokenScore = currentScore;
                    });

                    if (bestTokenScore > 0) {
                        totalScore += bestTokenScore;
                        matchedTokensCount++;
                    }
                });

                // Normalization and Bonuses
                if (matchedTokensCount > 0) {
                    // Penalty for query tokens not found
                    const coverage = matchedTokensCount / queryTokens.length;
                    totalScore = totalScore * coverage;

                    // Bonus for exact full string match
                    if (title === rawQuery) totalScore += 200;

                    // Bonus for pure substring match (consecutive)
                    if (title.includes(rawQuery)) totalScore += 50;
                } else {
                    totalScore = 0;
                }

                return { item, score: totalScore };
            });

            // Filter and Sort
            matches = matches
                .filter(m => m.score > 20) // Minimum threshold to reduce noise
                .sort((a, b) => b.score - a.score)
                .slice(0, 8) // Limit results
                .map(m => m.item);

            renderSuggestions(matches, rawQuery);
        } else {
            closeSuggestions();
        }
    }, 300); // 300ms delay

    searchInput.addEventListener('input', debouncedSearch);

    // Keyboard Navigation
    searchInput.addEventListener('keydown', (e) => {
        const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'Enter') {
            if (activeSuggestionIndex > -1) {
                e.preventDefault();
                items[activeSuggestionIndex].click();
            }
        } else if (e.key === 'Escape') {
            closeSuggestions();
        }
    });

    // Hide when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
            closeSuggestions();
        }
    });

    searchInput.addEventListener('focus', () => {
        if (searchIndex.length === 0) buildIndex(); // Build on focus too
        if (searchInput.value.trim().length > 0) {
            suggestionsDropdown.classList.remove('hidden');
        }
    });

    // --- Helpers ---

    function handleInPageFiltering(searchTerm) {
        let resultsFound = false;
        const activeContent = document.getElementById('windows-content');

        activeContent.querySelectorAll('section').forEach(section => {
            // Always show the banner carousel
            if (section.id === 'banner-carousel-section') {
                section.style.display = 'block';
                return;
            }

            let sectionHasVisibleItems = false;
            // Use specific selector for our identifiable cards if possible, or fallback to data attribute
            const items = section.querySelectorAll('[data-searchable-item]');
            const sectionHeader = section.querySelector('h3');
            const sectionHeaderMatch = sectionHeader ? sectionHeader.innerText.toLowerCase().includes(searchTerm) : false;

            items.forEach(item => {
                const itemText = item.getAttribute('data-searchable-item');
                // Check if card wrapper
                const cardWrapper = item.closest('.interactive-card') || item;

                if (itemText.includes(searchTerm)) {
                    item.style.display = '';
                    if (cardWrapper !== item) cardWrapper.style.display = '';
                    sectionHasVisibleItems = true;
                    resultsFound = true;
                } else {
                    item.style.display = 'none';
                    if (cardWrapper !== item) cardWrapper.style.display = 'none';
                }
            });

            if (section.id.includes('showcase') || sectionHeaderMatch || sectionHasVisibleItems) {
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        });

        if (searchTerm.length === 0) {
            document.querySelectorAll('#windows-content section').forEach(s => s.style.display = 'block');
        }

        if (noResultsMessage) noResultsMessage.style.display = resultsFound || searchTerm.length === 0 ? 'none' : 'block';
    }

    function renderSuggestions(matches, query) {
        if (matches.length === 0) {
            closeSuggestions();
            return;
        }

        activeSuggestionIndex = -1;
        suggestionsDropdown.innerHTML = '';
        suggestionsDropdown.classList.remove('hidden');

        // Group by Category helper
        const grouped = matches.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});

        Object.keys(grouped).forEach(category => {
            // Category Header
            const header = document.createElement('div');
            header.className = 'px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-800/50';
            header.textContent = category;
            suggestionsDropdown.appendChild(header);

            // Items
            grouped[category].forEach(item => {
                const div = document.createElement('div');
                div.className = 'suggestion-item px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors border-l-2 border-transparent';

                // Highlight logic (basic)
                const titleHtml = item.title;

                div.innerHTML = `
                    <div class="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-lg flex-shrink-0 border border-gray-700">
                        ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover rounded" onerror="this.style.display='none'">` : item.icon}
                    </div>
                    <div>
                        <div class="text-sm text-gray-200 font-medium">${titleHtml}</div>
                        <div class="text-xs text-gray-500">${item.category}</div>
                    </div>
                `;

                div.addEventListener('click', () => {
                    if (item.isExternal) {
                        // Navigate to plugin list and highlight instead of opening link
                        scrollToPluginListItem(item.title);
                    } else {
                        scrollToItem(item.id);
                    }
                    closeSuggestions();
                });

                suggestionsDropdown.appendChild(div);
            });
        });
    }

    function updateActiveSuggestion(items) {
        items.forEach((item, index) => {
            if (index === activeSuggestionIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    function closeSuggestions() {
        suggestionsDropdown.classList.add('hidden');
        activeSuggestionIndex = -1;
    }

    function scrollToItem(id) {
        const card = document.getElementById('card-' + id);
        searchInput.value = '';
        handleInPageFiltering('');

        // Ensure we're on main view before scrolling to card
        if (mainView && !mainView.classList.contains('active')) {
            transitionToView(mainView, () => {
                setTimeout(() => {
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => {
                            card.classList.add('highlight-pulse');
                            setTimeout(() => {
                                card.classList.remove('highlight-pulse');
                            }, 3000);
                        }, 500);
                    }
                }, 300);
            });
        } else {
            // Already on main view
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    card.classList.add('highlight-pulse');
                    setTimeout(() => {
                        card.classList.remove('highlight-pulse');
                    }, 3000);
                }, 500);
            }
        }
    }

    function scrollToPluginListItem(title) {
        // Clear search
        searchInput.value = '';
        handleInPageFiltering('');
        closeSuggestions();

        // Navigate to plugins list section
        const pluginsSection = document.getElementById('other-plugins');
        if (pluginsSection) {
            pluginsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Show the plugins list view
        setTimeout(() => {
            showPluginsList();

            // Wait for render, then find and highlight the plugin
            setTimeout(() => {
                // Create sanitized ID from title (same logic as renderPluginsListTable)
                const sanitizedId = 'plugin-list-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                console.log('Looking for plugin with ID:', sanitizedId);
                const pluginLink = document.getElementById(sanitizedId);
                console.log('Plugin element found:', pluginLink);

                if (pluginLink) {
                    // Scroll the plugin into view within the grid
                    pluginLink.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Apply highlight box effect
                    pluginLink.classList.add('plugin-highlight-box');
                    setTimeout(() => {
                        pluginLink.classList.remove('plugin-highlight-box');
                    }, 3000); // Keep highlight longer for visibility
                }
            }, 600); // Increased wait for view transition and render
        }, 800); // Increased wait for scroll to section
    }
}

// Global function for header navigation - works from any view
window.navigateToSection = function (sectionId) {
    // First, ensure we're on the main view
    if (mainView && !mainView.classList.contains('active')) {
        transitionToView(mainView, () => {
            // After transition, scroll to section
            setTimeout(() => {
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
        });
    } else {
        // Already on main view, just scroll
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements Init
    mainView = document.getElementById('main-view');
    document.body.classList.add('no-scroll'); // Disable scroll initially
    softwareDetailView = document.getElementById('software-detail-view');
    itemDetailView = document.getElementById('item-detail-view');
    pluginsListView = document.getElementById('plugins-list-view');
    easyWorkflowView = document.getElementById('easy-workflow-view');
    atomxPacksView = document.getElementById('atomx-packs-view');

    // Aurora Parallax
    const parallaxElements = document.querySelectorAll('.aurora-shape');
    window.addEventListener('scroll', () => {
        const scrollPosition = window.pageYOffset;
        requestAnimationFrame(() => {
            parallaxElements.forEach(el => {
                const speed = parseFloat(el.dataset.speed) || 0.5;
                el.style.transform = `translateY(${scrollPosition * speed}px)`;
            });
        });
    }, { passive: true });

    // Mouse Follower logic moved to centralized loop in initVisualEnhancements()


    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Back Buttons
    const backBtnMappings = [
        { id: 'software-back-button', target: 'software' },
        { id: 'item-back-button', dynamic: true },
        { id: 'list-back-button', target: 'other-plugins' },
        { id: 'workflow-back-button', target: 'easy-workflow-showcase' },
        { id: 'atomx-back-button', custom: true }
    ];

    backBtnMappings.forEach(map => {
        const btn = document.getElementById(map.id);
        if (!btn) return;
        btn.onclick = () => {
            if (window.isFromFavorites) {
                transitionToView(favoritesView);
                window.isFromFavorites = false; // Reset
                return;
            }

            if (map.dynamic) {
                goBackToMain(window.lastViewedSection || 'plugins');
            } else if (map.custom && map.id === 'atomx-back-button') {
                const atomItem = appData.scripts.find(i => i.Title.toLowerCase().includes('atomx'));
                if (atomItem) showItemDetail('scripts', atomItem.id);
                else goBackToMain('scripts');
            } else {
                goBackToMain(map.target);
            }
        };
    });

    const backToTopButton = document.getElementById('back-to-top');
    if (backToTopButton) {
        backToTopButton.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                backToTopButton.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
            } else {
                backToTopButton.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
            }
        }, { passive: true });
    }

    window.goBackToMain = function (sectionId) {
        const itemDetail = document.getElementById('item-detail-view');
        // Check if modal is actually open (not hidden)
        if (itemDetail && !itemDetail.classList.contains('hidden')) {
            itemDetail.classList.add('hidden');
            document.body.style.overflow = ''; // Restore scroll

            // Remove blur from background
            const mainView = document.getElementById('main-view');
            const header = document.getElementById('header');
            const favoritesView = document.getElementById('favorites-view');
            if (mainView) mainView.style.filter = '';
            if (header) header.style.filter = '';
            if (favoritesView) favoritesView.style.filter = '';

            // Restore saved scroll position
            if (typeof window.savedModalScrollPosition === 'number') {
                setTimeout(() => {
                    window.scrollTo(0, window.savedModalScrollPosition);
                }, 50);
            }
            return;
        }

        transitionToView(mainView, () => {
            // Restore saved scroll position instead of scrollIntoView
            if (typeof window.savedModalScrollPosition === 'number') {
                window.scrollTo(0, window.savedModalScrollPosition);
            }
        });
    };

    // User Message Form Submission
    const messageForm = document.getElementById('user-message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nameInput = document.getElementById('user-name');
            const messageInput = document.getElementById('user-message');
            const statusEl = document.getElementById('message-status');
            const submitBtn = messageForm.querySelector('button[type="submit"]');

            const name = nameInput.value.trim();
            const message = messageInput.value.trim();

            if (!name || !message) {
                statusEl.textContent = 'Please fill in all fields';
                statusEl.className = 'text-center text-sm text-red-400 block mt-2';
                return;
            }

            // Disable button and show loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            statusEl.className = 'text-center text-sm text-gray-400 block mt-2';
            statusEl.textContent = 'Sending your message...';

            // Attempt auto-login anonymously if needed (for guests)
            if (!auth.currentUser) {
                try {
                    console.log("Attempting anonymous sign-in...");
                    await auth.signInAnonymously();
                } catch (authErr) {
                    console.warn("Anonymous auth failed (likely disabled in console):", authErr);
                }
            }

            try {
                await db.ref('userMessages').push({
                    name: name,
                    message: message,
                    timestamp: Date.now()
                });

                // Success
                statusEl.className = 'text-center text-sm text-green-400 block mt-2';
                statusEl.textContent = '✓ Message sent successfully! We\'ll review it soon.';
                messageForm.reset();

                // Reset after 3 seconds
                setTimeout(() => {
                    statusEl.className = 'text-center text-sm hidden';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Message';
                }, 3000);

            } catch (error) {
                console.error('Error sending message:', error);
                statusEl.className = 'text-center text-sm text-red-400 block mt-2';

                if (error.code === 'PERMISSION_DENIED') {
                    statusEl.innerHTML = '✗ Permission denied. Please <a href="auth.html#signup" class="underline text-indigo-400 hover:text-white">Sign Up</a> or Log In.';
                } else {
                    statusEl.textContent = '✗ Error sending message: ' + (error.message || 'Please try again.');
                }

                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
            }
        });
    }

    // ==================== SUB-ITEMS VIEW FUNCTIONS ====================

    let subItemsView; // Will be initialized in DOMContentLoaded

    // Show Sub-Items View for a specific item
    window.showSubItemsView = function (collectionName, itemId) {
        const item = appData[collectionName].find(x => x.id === itemId);
        if (!item || !item.hasSubItems || !item.subItems) {
            showToast('No sub-items available for this resource.', 'info');
            return;
        }

        // Store context for back navigation
        window.lastViewedSection = collectionName;
        window.currentSubItemsParent = { collection: collectionName, id: itemId, wasFromFavorites: window.isFromFavorites };


        // Close the item detail modal if open
        const itemDetailView = document.getElementById('item-detail-view');
        if (itemDetailView) {
            itemDetailView.classList.add('hidden');
            document.body.style.overflow = ''; // Re-enable scroll

            // Remove blur from background
            const mainView = document.getElementById('main-view');
            const header = document.getElementById('header');
            const favoritesView = document.getElementById('favorites-view');
            if (mainView) mainView.style.filter = '';
            if (header) header.style.filter = '';
            if (favoritesView) favoritesView.style.filter = '';
        }

        // Transition to sub-items view
        if (!subItemsView) {
            subItemsView = document.getElementById('sub-items-view');
        }

        if (subItemsView) {
            transitionToView(subItemsView, () => {
                renderSubItemsGrid(item);
            });
        }
    };

    // Render sub-items in dense list grid
    // Render sub-items in card grid (AtomX Style)
    function renderSubItemsGrid(item) {
        const titleEl = document.getElementById('sub-items-title');
        const descriptionEl = document.getElementById('sub-items-description');
        const gridEl = document.getElementById('sub-items-grid');

        if (!gridEl) return;

        // Set title and description
        if (titleEl) {
            titleEl.innerHTML = item.subItemsPageTitle || `<span class="gradient-text">${item.Title}</span> Resources`;
        }
        if (descriptionEl) {
            descriptionEl.textContent = item.subItemsPageDescription || `Explore all available resources for ${item.Title}`;
        }

        // Clear grid
        gridEl.innerHTML = '';

        // Render sub-items as cards
        const subItems = item.subItems || [];

        if (subItems.length === 0) {
            gridEl.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <p class="text-gray-400 text-lg">No resources available yet.</p>
                </div>
            `;
            return;
        }

        subItems.forEach(subItem => {
            const previewUrl = subItem.previewURL || '';
            const downloadLink = subItem.downloadLink || '#';
            const title = subItem.title || 'Untitled Resource';
            const hasPreview = previewUrl && previewUrl.trim() !== '';

            const proBadge = item.isPro ? `
                <div class="absolute top-2 left-2 z-20 pointer-events-none">
                    <span class="bg-yellow-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-0.5">
                        <i class="fa-solid fa-crown text-[7px]"></i> PRO
                    </span>
                </div>
            ` : '';

            const cardHTML = `
                <div class="interactive-card">
                    <div class="glass-card element-hover relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0f] p-5 flex flex-col justify-between text-center h-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(79,70,229,0.2)]">
                        ${proBadge}
                        <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                        <h5 class="text-base font-bold text-white mb-4 flex-grow flex items-center justify-center relative z-10">${title}</h5>
                        <div class="flex flex-col sm:flex-row gap-2 justify-center mt-auto relative z-10">
                            ${hasPreview ? `
                                <a href="${previewUrl}" target="_blank"
                                    class="block w-full sm:w-auto flex-1 bg-gray-700/50 border border-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-full text-sm transition-colors backdrop-blur-sm">
                                    Preview
                                </a>
                            ` : ''}
                            <a href="#" onclick="handleDownloadSecure('${btoa(downloadLink)}', '${title.replace(/'/g, "\\'")}', ${item.isPro || false}, ${item.price || 0}, '${item.id}'); event.stopPropagation(); return false;"
                                class="block w-full sm:w-auto flex-1 gradient-btn text-white font-semibold py-2 px-4 rounded-full text-sm shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2 group-hover:scale-105 transition-transform duration-300">
                                ${item.isPro ? '<i class="fa-solid fa-crown text-[10px]"></i>' : '<span>Download</span>'}
                                ${item.isPro ? '<span>Unlock</span>' : ''}
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            `;

            gridEl.insertAdjacentHTML('beforeend', cardHTML);
        });
    }

    // Go back from sub-items view
    window.goBackFromSubItems = function () {
        if (window.currentSubItemsParent) {
            const { collection, id, wasFromFavorites } = window.currentSubItemsParent;
            const targetView = wasFromFavorites ? document.getElementById('favorites-view') : document.getElementById('main-view');
            const contextArg = wasFromFavorites ? 'favorites' : null;

            transitionToView(targetView, () => {
                // Re-open the item detail modal to restore context
                // wrapped in setTimeout to ensure it runs AFTER hideAllViews() inside transitionToView
                setTimeout(() => {
                    if (typeof showItemDetail === 'function') {
                        // Pass preserveScroll=true to prevent overwriting the saved scroll position
                        showItemDetail(collection, id, contextArg, true);
                    }
                }, 100);
            });

            // Restore scroll position AFTER transitionToView completes its scrollTo(0,0)
            // transitionToView does: 400ms delay + scrollTo(0,0) + 500ms animation
            setTimeout(() => {
                if (typeof window.savedModalScrollPosition === 'number') {
                    window.scrollTo(0, window.savedModalScrollPosition);
                }
            }, 450); // After the initial 400ms + small buffer
        } else {
            transitionToView(document.getElementById('main-view'));
        }
    };



    // Load Data & Render
    fetchData().then(() => {
        return applySectionOrder();
    }).then(() => {
        renderAll();

        // Initialize sub-items view and back button
        subItemsView = document.getElementById('sub-items-view');
        const subItemsBackBtn = document.getElementById('sub-items-back-button');
        if (subItemsBackBtn) {
            subItemsBackBtn.onclick = goBackFromSubItems;
        }



        // HIde Preloader
        // Hide Preloader with Minimum Display Time
        const preloader = document.getElementById('preloader');
        if (preloader) {
            setTimeout(() => {
                preloader.style.opacity = '0';
                preloader.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    preloader.style.display = 'none';
                    document.body.classList.remove('no-scroll'); // Re-enable scroll
                }, 500);
            }, 2000); // 2 seconds minimum load time to show off effects
        }



    });


    // Mobile Menu Toggle (if needed)
    // Add logic if header needs it

    // --- Authentication & Profile Logic ---

    // --- Toast Notification Logic ---
    window.showToast = function (message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icon
        let iconHtml = '';
        if (type === 'success') iconHtml = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
        else if (type === 'error') iconHtml = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        else iconHtml = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

        toast.innerHTML = `
            <div class="toast-icon">${iconHtml}</div>
            <span class="flex-1">${message}</span>
        `;

        container.appendChild(toast);

        // Auto Remove
        setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => {
                toast.remove();
                if (container.children.length === 0) container.remove();
            });
        }, 3000);
    };

    // --- Custom Alert Function (Legacy / Modal) ---
    function showAlert(message, title = 'Notice', type = 'info') {
        const modal = document.getElementById('custom-alert-modal');
        if (!modal) return alert(message); // Fallback

        const titleEl = modal.querySelector('.modal-title');
        const messageEl = modal.querySelector('.modal-message');
        const okBtn = modal.querySelector('.modal-btn-primary');
        const iconContainer = modal.querySelector('.modal-icon');
        const iconSvg = iconContainer.querySelector('svg');

        // Set content
        titleEl.textContent = title;
        messageEl.textContent = message;

        // Set icon styles based on type
        if (type === 'error') {
            iconContainer.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; // red-500/20
            iconContainer.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>';
            iconSvg.style.color = '#ef4444'; // red-500
        } else if (type === 'success') {
            iconContainer.style.backgroundColor = 'rgba(34, 197, 94, 0.2)'; // green-500/20
            iconContainer.style.borderColor = 'rgba(34, 197, 94, 0.5)';
            iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
            iconSvg.style.color = '#22c55e'; // green-500
        } else {
            iconContainer.style.backgroundColor = 'rgba(99, 102, 241, 0.2)'; // indigo-500/20
            iconContainer.style.borderColor = 'rgba(99, 102, 241, 0.5)';
            iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
            iconSvg.style.color = '#6366f1'; // indigo-500
        }

        modal.classList.remove('hidden');

        // Handle Close
        const handleOk = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', handleOk);
            // If it was a ban/delete, we might want to reload after aknowledgement
            if (message.includes("BANNED") || message.includes("DELETED")) {
                window.location.reload();
            }
        };
        okBtn.addEventListener('click', handleOk);
    }

    // Listen for Auth State Changes
    let userProfileRef = null;

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        const signupBtn = document.getElementById('btn-signup-header');
        const profileBtn = document.getElementById('btn-profile');

        // Cleanup previous listener if exists
        if (userProfileRef) {
            userProfileRef.off();
            userProfileRef = null;
        }

        if (user) {
            // User is logged in
            if (signupBtn) signupBtn.classList.add('lg:hidden'); // Hide Sign Up
            if (signupBtn) signupBtn.classList.remove('lg:block');

            if (profileBtn) profileBtn.classList.remove('hidden');
            if (profileBtn) profileBtn.classList.add('lg:flex');

            // Fetch user profile from DB (using Auth UID as key)
            // Use .on() for real-time updates (Immediate Ban/Unban/Deletion)
            userProfileRef = firebase.database().ref('users/' + user.uid);
            userProfileRef.on('value', (snapshot) => {
                if (snapshot.exists()) {
                    const profile = snapshot.val();

                    // 1. Immediate Ban Check
                    if (profile.isBanned) {
                        auth.signOut().then(() => {
                            showAlert("Your account has been BANNED by the administrator.", "Account Banned", "error");
                        });
                        return;
                    }

                    userProfile = profile;
                    updateProfileUI(userProfile);

                    // Show Pro badge if already paid or admin, else show purchase button
                    const proBtn = document.getElementById('pro-access-btn');
                    if (profile.isPaid || profile.role === 'admin') {
                        unlockWebsite(); // Automatically unlock for Pro/Admin
                        
                        if (proBtn) {
                            // Transform into a Pro Member badge instead of hiding
                            proBtn.innerHTML = '<i class="fa-solid fa-crown mr-2 text-yellow-400"></i> Pro Member';
                            proBtn.classList.remove('gradient-btn', 'hover:scale-105');
                            proBtn.classList.add('bg-white/5', 'border', 'border-yellow-500/30', 'text-yellow-400', 'cursor-default');
                            proBtn.onclick = null; // Disable payment trigger
                        }
                    } else {
                        if (proBtn) {
                            // Reset to purchase button if status changes (unlikely but safe)
                            proBtn.innerHTML = '<i class="fa-solid fa-crown mr-2"></i> Get Pro Access';
                            proBtn.classList.add('gradient-btn', 'hover:scale-105');
                            proBtn.classList.remove('bg-white/5', 'border', 'border-yellow-500/30', 'text-yellow-400', 'cursor-default');
                            proBtn.onclick = () => processPayment();
                        }
                    }
                } else {
                    // 2. Safe Deletion Check
                    // We don't sign out immediately to prevent accidental logouts during network blips.
                    // If the profile is truly missing, the UI will simply show 'Guest' or 'User'.
                    console.warn("User profile node missing in database for UID:", user.uid);
                }
            }, (error) => {
                console.error("Error fetching profile:", error);
            });
        } else {
            // User is logged out
            if (signupBtn) signupBtn.classList.remove('lg:hidden');
            if (signupBtn) signupBtn.classList.add('lg:block');

            if (profileBtn) profileBtn.classList.add('hidden');
            if (profileBtn) profileBtn.classList.remove('lg:flex');

            // Show Pro button for guests
            const proBtn = document.getElementById('pro-access-btn');
            if (proBtn) proBtn.classList.remove('hidden');

            userProfile = null;
        }
    });

    function updateProfileUI(profile) {
        const initials = profile.name ? profile.name.charAt(0).toUpperCase() : 'U';

        // Header UI
        const headerInitials = document.getElementById('header-initials');
        const headerUsername = document.getElementById('header-username');
        if (headerInitials) headerInitials.textContent = initials;
        if (headerUsername) headerUsername.textContent = profile.name.split(' ')[0]; // First name only

        // Modal UI
        const modalInitials = document.getElementById('profile-initials');
        const modalName = document.getElementById('profile-name');
        const modalEmail = document.getElementById('profile-email');
        const modalJoined = document.getElementById('profile-joined');

        if (modalInitials) modalInitials.textContent = initials;
        if (modalName) modalName.textContent = profile.name;
        if (modalEmail) modalEmail.textContent = profile.email;

        if (modalJoined) {
            if (profile.createdAt) {
                const date = new Date(profile.createdAt);
                modalJoined.textContent = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            } else {
                modalJoined.textContent = 'N/A';
            }
        }

        // Status Update
        const statusText = document.getElementById('profile-status-text');
        const statusIcon = document.getElementById('profile-status-icon');
        const statusRow = document.getElementById('profile-status-row');

        if (statusText && statusIcon) {
            if (profile.role === 'admin') {
                statusText.textContent = 'Crew Member';
                statusText.className = 'text-xs font-bold px-2 py-1 rounded bg-purple-500/20 text-purple-400 uppercase tracking-tighter border border-purple-500/30';
                statusIcon.className = 'w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400';
                statusIcon.innerHTML = '<i class="fa-solid fa-user-shield text-xs"></i>';
            } else if (profile.isPaid) {
                statusText.textContent = 'Pro Member';
                statusText.className = 'text-xs font-bold px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 uppercase tracking-tighter border border-yellow-500/30';
                statusIcon.className = 'w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400';
                statusIcon.innerHTML = '<i class="fa-solid fa-crown text-xs"></i>';
            } else {
                statusText.textContent = 'Free Tier';
                statusText.className = 'text-xs font-bold px-2 py-1 rounded bg-gray-500/20 text-gray-400 uppercase tracking-tighter border border-gray-500/30';
                statusIcon.className = 'w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center text-gray-400';
                statusIcon.innerHTML = '<i class="fa-solid fa-user text-xs"></i>';
            }
        }
    }

});

// Global Modal Functions (must be outside DOMContentLoaded)
function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    const backdrop = document.getElementById('profile-backdrop');
    const card = document.getElementById('profile-card');

    if (modal) {
        modal.classList.remove('hidden');
        // Trigger animations
        requestAnimationFrame(() => {
            backdrop.classList.remove('opacity-0');
            card.classList.remove('opacity-0', 'scale-95');
            card.classList.add('scale-100');
        });
    }
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    const backdrop = document.getElementById('profile-backdrop');
    const card = document.getElementById('profile-card');

    if (modal) {
        backdrop.classList.add('opacity-0');
        card.classList.add('opacity-0', 'scale-95');
        card.classList.remove('scale-100');

        setTimeout(() => {
            modal.classList.add('hidden');
            // Reset password view
            isProfilePasswordVisible = false;
            const display = document.getElementById('profile-password-display');
            const icon = document.getElementById('profile-eye-icon');
            if (display) display.textContent = '••••••••';
            // Reset icon
            if (icon) icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />';
        }, 300);
    }
}

let isProfilePasswordVisible = false;
// Refactored to use callback-based showAlert
function toggleProfilePassword() {
    const display = document.getElementById('profile-password-display');
    const icon = document.getElementById('profile-eye-icon');

    // CASE 1: Currently Hidden -> User wants to Show
    if (!isProfilePasswordVisible) {
        showAlert(
            'Are you sure you want to view your password? Make sure no one is watching your screen.',
            'Security Warning',
            'warning',
            async () => {
                isProfilePasswordVisible = true;

                // Show Loading
                display.textContent = 'Loading...';

                // Security: Do not fetch or display plain-text passwords from the database.
                // Instead, offer to send a reset email.
                showAlert(
                    "For your security, passwords are encrypted and cannot be viewed. Would you like us to send a password reset link to your email?",
                    "Password Security",
                    "info",
                    async () => {
                        try {
                            await auth.sendPasswordResetEmail(currentUser.email);
                            showAlert("Reset link sent! Please check your email.", "Success", "success");
                        } catch (err) {
                            showAlert("Error sending reset link: " + err.message, "Error", "error");
                        }
                    },
                    "Send Reset Link",
                    () => {}
                );
                
                isProfilePasswordVisible = false;
                display.textContent = '••••••••';

                // Update Icon (Open Eye / Slash)
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />';
                icon.classList.add('text-purple-400');
            },
            'View Password',
            () => {
                // --- ON CANCEL ---
                // Do nothing
            }
        );
        return;
    }

    // CASE 2: Currently Visible -> User wants to Hide
    isProfilePasswordVisible = false;
    display.textContent = '••••••••';

    // Update Icon (Closed Eye)
    icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />';
    icon.classList.remove('text-purple-400');
}

async function handleLogout() {
    try {
        await auth.signOut();
        closeProfileModal();
        window.location.href = 'auth.html';
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

// --- Report Broken Link Logic ---
function openReportModal(name, category) {
    const modal = document.getElementById('report-modal');
    const backdrop = document.getElementById('report-backdrop');
    const card = document.getElementById('report-card');

    // Reset Form
    document.getElementById('report-user-name').value = '';
    document.getElementById('report-resource-name').value = name || 'Unknown Resource';
    document.getElementById('report-category').value = category || 'Unknown Category';

    // Reset Details and Error State
    const detailsInput = document.getElementById('report-details');
    detailsInput.value = '';
    detailsInput.classList.remove('border-red-500', 'focus:ring-red-500');
    detailsInput.classList.add('border-white/5', 'focus:border-red-500/50'); // Reset to original styles from HTML

    const errorMsg = document.getElementById('report-error-msg');
    if (errorMsg) errorMsg.classList.add('hidden');

    if (modal) {
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            backdrop.classList.remove('opacity-0');
            card.classList.remove('opacity-0', 'scale-95');
            card.classList.add('scale-100');
        });
    }
}

function closeReportModal() {
    const modal = document.getElementById('report-modal');
    const backdrop = document.getElementById('report-backdrop');
    const card = document.getElementById('report-card');

    if (modal) {
        backdrop.classList.add('opacity-0');
        card.classList.add('opacity-0', 'scale-95');
        card.classList.remove('scale-100');

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
}

function submitBrokenLinkReport() {
    const userName = document.getElementById('report-user-name').value.trim() || 'Anonymous';
    const resourceName = document.getElementById('report-resource-name').value;
    const category = document.getElementById('report-category').value;
    const detailsInput = document.getElementById('report-details');
    const details = detailsInput.value.trim();

    // Reset previous error state
    detailsInput.classList.remove('border-red-500', 'focus:ring-red-500');
    detailsInput.classList.add('border-gray-700', 'focus:ring-indigo-500');
    const errorMsg = document.getElementById('report-error-msg');
    if (errorMsg) errorMsg.classList.add('hidden');

    if (!details) {
        // Apply Error State
        detailsInput.classList.remove('border-gray-700', 'focus:ring-indigo-500');
        detailsInput.classList.add('border-red-500', 'focus:ring-red-500');
        detailsInput.focus();

        // Show Inline Error
        if (errorMsg) errorMsg.classList.remove('hidden');

        // Add one-time listener to remove error on input
        detailsInput.addEventListener('input', function () {
            detailsInput.classList.remove('border-red-500', 'focus:ring-red-500');
            detailsInput.classList.add('border-gray-700', 'focus:ring-indigo-500');
            if (errorMsg) errorMsg.classList.add('hidden');
        }, { once: true });

        // Removed general showAlert to focus on the inline warning as requested
        return;
    }

    const reportData = {
        userName: userName,
        resourceName: resourceName,
        category: category,
        details: details,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'pending' // Default to pending matching new logic
    };

    // Save to Firebase
    db.ref('brokenLinkReports').push(reportData)
        .then(() => {
            closeReportModal();
            showToast('Thank you for your report! We will look into it shortly.', 'success');
        })
        .catch((error) => {
            console.error("Error submitting report:", error);
            showToast('Failed to submit report. Please try again.', 'error');
        });
}

// --- Light Hover Effect & Ripple Logic ---
// Optimized: Removed 3D rotation to save CPU/GPU overhead on laptops.
document.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.interactive-card');
    if (!target) return;

    requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update CSS Variables for localized lighting/glow
        target.style.setProperty('--x', `${x}px`);
        target.style.setProperty('--y', `${y}px`);
    });
});

document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.interactive-card');
    if (target) {
        target.style.removeProperty('--x');
        target.style.removeProperty('--y');
    }
});

// Ripple Effect Listener
document.addEventListener('mousedown', (e) => {
    const target = e.target.closest('.ios-glass-card');
    if (target) {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        // Calculate max dimension for full fill
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.marginTop = ripple.style.marginLeft = `-${size / 2}px`; // Center

        target.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 600);
    }
});

// ==================== Scroll To Top Logic ====================
document.addEventListener('DOMContentLoaded', () => {
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (scrollToTopBtn) {
        // Scroll Visibility Logic
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
                scrollToTopBtn.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
            } else {
                scrollToTopBtn.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
                scrollToTopBtn.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
            }
        });

        // Click Handler (Robust)
        scrollToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            // Fallback for older browsers or if behavior smooth fails
            if (!('scrollBehavior' in document.documentElement.style)) {
                document.body.scrollTop = 0; // For Safari
                document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
            }
        });
    }
});

// ==================== VISUAL & USABILITY ENHANCEMENTS (NEW) ====================

function initVisualEnhancements() {
    // 1. Custom Magnetic Cursor
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorOutline = document.querySelector('.cursor-outline');

    if (cursorDot && cursorOutline) {
        let mouseX = 0;
        let mouseY = 0;
        let outlineX = 0;
        let outlineY = 0;
        let followerX = 0;
        let followerY = 0;

        const mouseFollower = document.getElementById('mouse-follower');

        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Dot follows instantly via translate for better perf
            cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;

            // Update mouse follower immediately if visible
            if (mouseFollower) {
                mouseFollower.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
            }
        }, { passive: true });

        // Use requestAnimationFrame for the smooth outline follow
        function animateCursor() {
            // Smooth lerp for the outline
            outlineX += (mouseX - outlineX) * 0.15;
            outlineY += (mouseY - outlineY) * 0.15;

            cursorOutline.style.transform = `translate3d(${outlineX}px, ${outlineY}px, 0) translate(-50%, -50%)`;

            requestAnimationFrame(animateCursor);
        }

        requestAnimationFrame(animateCursor);

        document.body.addEventListener('mouseenter', () => {
            if (mouseFollower) mouseFollower.style.opacity = '1';
        });
        document.body.addEventListener('mouseleave', () => {
            if (mouseFollower) mouseFollower.style.opacity = '0';
        });

        // Add hovering effect on interactive elements
        const iteractiveElements = ['a', 'button', '.interactive-card', 'input', 'textarea', '.glass-card'];

        iteractiveElements.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
                el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
            });
        });

        // Re-apply listeners for dynamic content when needed (simple observer approach)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element
                            // Apply to key clickable elements inside new content
                            const clickables = node.querySelectorAll('a, button, .interactive-card');
                            clickables.forEach(el => {
                                el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
                                el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
                            });

                            // Also check if the node itself is clickable
                            if (node.matches('a, button, .interactive-card')) {
                                node.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
                                node.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
                            }
                        }
                    });
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 2. Typing Animation for Hero Text
    const typingElement = document.getElementById('typing-text');
    if (typingElement) {
        const words = ["Editing Resources", "VFX Assets", "Premium Scripts", "Creative Tools"];
        let wordIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let typeSpeed = 100;

        function type() {
            const currentWord = words[wordIndex];

            if (isDeleting) {
                typingElement.textContent = currentWord.substring(0, charIndex - 1);
                charIndex--;
                typeSpeed = 50; // Faster deletion
            } else {
                typingElement.textContent = currentWord.substring(0, charIndex + 1);
                charIndex++;
                typeSpeed = 100; // Normal typing
            }

            if (!isDeleting && charIndex === currentWord.length) {
                isDeleting = true;
                typeSpeed = 2000; // Pause at end
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                wordIndex = (wordIndex + 1) % words.length;
                typeSpeed = 500; // Pause before new word
            }

            setTimeout(type, typeSpeed);
        }

        // Start typing loop
        setTimeout(type, 1000);
    }

    // 3 & 4. Throttled Scroll Events
    const header = document.getElementById('header');
    const scrollTopBtn = document.getElementById('scroll-to-top');
    let scrollTicking = false;

    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            window.requestAnimationFrame(() => {
                const scrollY = window.scrollY;

                // Header update
                if (scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }

                // Scroll top button update
                if (scrollTopBtn) {
                    if (scrollY > 300) {
                        scrollTopBtn.classList.add('visible');
                    } else {
                        scrollTopBtn.classList.remove('visible');
                    }
                }

                scrollTicking = false;
            });
            scrollTicking = true;
        }
    }, { passive: true });

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

// Initialize on Load
// ==================== SEARCH FUNCTIONALITY ====================

function initSearch() {
    const searchInput = document.getElementById('search-input');
    const noResultsMsg = document.getElementById('no-results-message');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const allCards = document.querySelectorAll('.interactive-card:not(.hidden)'); // Target visible cards only? No, all cards.
            // Actually, we should target all cards that ARE content.
            // Let's target by specific containers to avoid hiding structural cards if any.
            // Or just target all .interactive-card that have a title.

            let matchCount = 0;
            let hasSearched = query.length > 0;

            const contentCards = document.querySelectorAll('#windows-content .interactive-card, #courses-container .interactive-card');

            contentCards.forEach(card => {
                const titleEl = card.querySelector('h4, h5');
                const descEl = card.querySelector('p');

                if (titleEl) {
                    const title = titleEl.textContent.toLowerCase();
                    const desc = descEl ? descEl.textContent.toLowerCase() : '';

                    if (title.includes(query) || desc.includes(query)) {
                        card.classList.remove('hidden-by-search');
                        card.style.display = ''; // Reset display
                        matchCount++;
                    } else {
                        card.classList.add('hidden-by-search');
                        card.style.display = 'none'; // Hide
                    }
                }
            });

            // Handle No Results
            if (noResultsMsg) {
                if (hasSearched && matchCount === 0) {
                    noResultsMsg.classList.remove('hidden');
                } else {
                    noResultsMsg.classList.add('hidden');
                }
            }

            // Optional: Scroll to results if searching
            if (hasSearched && matchCount > 0 && window.scrollY < 300) {
                // window.scrollTo({ top: 300, behavior: 'smooth' });
            }
        });
    }
}

// Call Init Functions
window.addEventListener('DOMContentLoaded', () => {
    initVisualEnhancements();
    initSearch();
    checkPaywall(); // Added paywall check on load
});

// --- 9. SECURITY SHIELD (Anti-Inspection Deterrents) ---

(function () {
    // 1. Disable Right-Click
    document.addEventListener('contextmenu', e => e.preventDefault());

    // 2. Disable Key Shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
    document.onkeydown = function (e) {
        if (e.keyCode == 123) return false; // F12
        if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false;
        if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false;
        if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false;
        if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false;
    };

    // 3. Debugger Trap (Deterrent)
    // This creates a loop that triggers a debugger pause if DevTools is open, 
    // making it very frustrating for someone to inspect the logic.
    setInterval(function () {
        const startTime = performance.now();
        debugger;
        const endTime = performance.now();
        if (endTime - startTime > 100) {
            // If the time difference is large, it means the debugger actually paused (DevTools open)
            console.clear();
            console.log("%cSECURITY ALERT: Unauthorized inspection detected.", "color: red; font-size: 20px; font-weight: bold;");
        }
    }, 1000);

    // 4. Console Clearing
    console.log("%cSoftwhereHub Security Active", "color: #4f46e5; font-size: 30px; font-weight: bold;");
    console.log("If someone told you to copy-paste something here, they are trying to steal your account.");
})();

// --- END OF SCRIPT ---
