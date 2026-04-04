if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}


const express = require('express')
const bodyParser = require('body-parser')
const mysql = require('mysql2')
const app = express()
const bcryptjs = require('bcryptjs')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const MySQLStore = require('express-mysql-session')(session);
const methodOverride = require('method-override')
const db = require('./src/database/connection.js')
const { sendEmail } = require('./mailsend.js'); // 1. I-import ang sendEmail function
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs'); // IMPORT EXCELJS LIBRARY
const cloudinary = require('cloudinary').v2; // Import Cloudinary
const DatauriParser = require('datauri/parser'); // Para i-convert ang buffer sa data URI

// --- SETUP NG UPLOADER (MULTER) ---
// Pinaka-safe sa Render/Linux na ilagay ang uploads sa loob ng Public folder.
// PAALALA: Siguraduhin na ang folder name sa GitHub ay saktong 'Public' (Capital P).
// Kung lowercase 'public' ito sa GitHub, palitan ang code sa ibaba para mag-match.
const uploadDir = path.join(__dirname, 'Public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Gamitin ang memoryStorage para sa profile pictures para ma-upload sa Cloudinary
// Hindi na ito magse-save sa local disk
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limitahan sa 5MB ang profile picture
}).single('profile_pic'); // 'profile_pic' dapat ang name sa HTML input

// Initialize DatauriParser
const parser = new DatauriParser();

// Helper function para i-convert ang buffer sa data URI
const formatBufferToDataUri = (file) => {
    // Siguraduhing may file at buffer
    if (!file || !file.buffer) return null;
    // Mas safe gamitin ang mimetype kaysa extname para sa Cloudinary
    return parser.format(path.extname(file.originalname), file.buffer).content;
};

// --- SETUP DTR IMAGE UPLOADER ---
// Gamitin ang memoryStorage para makuha ang buffer ng image para sa Base64 database storage
const uploadDTR = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limitahan sa 10MB ang picture
}).single('dtr_image');

// --- SETUP MENU IMAGE UPLOADER ---
const uploadMenu = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limitahan sa 5MB ang menu image
}).single('menu_image');

const initializePassport = require('./passport-config'); 

// Helper function: Ayusin ang user data para hindi magkaproblema sa Case Sensitivity
function normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    const normalized = {};
    
    // Optimized loop para sa malalaking Base64 strings (iwas JSON.stringify bottleneck)
    for (let key in user) {
        if (Object.prototype.hasOwnProperty.call(user, key)) {
            normalized[key.toUpperCase()] = user[key];
        }
    }

    if (normalized.CATEGORY) {
        normalized.CATEGORY = normalized.CATEGORY.toString().trim().toUpperCase();
    }
    return normalized;
}

// SERVER.JS (Line 19 pataas)
initializePassport(
    passport,
    async (username) => {
        try {
            const users = await db('SELECT * FROM accounts WHERE username = ?', [username]);
            return users[0];
        } catch (e) {
            console.error("[PASSPORT ERROR] Fetch by username:", e);
            return null;
        }
    },
    async (id) => {
        try {
            const users = await db('SELECT * FROM accounts WHERE id = ?', [id]);
            return users[0];
        } catch (e) {
            console.error("[PASSPORT ERROR] Fetch by ID:", e);
            return null;
        }
    }
);

app.set('view engine', 'ejs');
// Middleware: Pagsasaayos ng order at paglilinis
app.use(express.json({ limit: '50mb' })); // Tinaasan ang limit para sa malalaking Base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Render uses a reverse proxy (load balancer). Trusting it is required for secure cookies/sessions.
app.set('trust proxy', 1);

// Setup persistent session store gamit ang MySQL pool
const sessionStore = new MySQLStore({}, db.pool);

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'itaewon-kopi-fallback-secret-12345', 
    resave: false,
    saveUninitialized: false, // Iniiwasan ang paggawa ng empty sessions
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true if on Render (HTTPS), false for local dev
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}))

// Check if SESSION_SECRET is set, and warn if not (especially in production)
if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: SESSION_SECRET environment variable is not set. Using a default secret. THIS IS INSECURE FOR PRODUCTION!");
    console.warn("Please set SESSION_SECRET in your Render environment variables.");
}
app.use(flash()) // Dapat laging pagkatapos ng session
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

// Static Files - Siguraduhing Case Sensitive ang 'Public' folder
app.use(express.static(path.join(__dirname, 'Public')));

// Prevent Browser Caching (Para hindi ma-access ang back button pagka-logout o redirect)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
});

const accountsRoute = require('./src/routes/accounts.js')
app.use('/accounts', accountsRoute)

// Root Route: Redirect sa homepage kapag binisita ang main URL
app.get('/', (req, res) => {
    res.redirect('/login');
});

//HOMEPAGE 
app.get('/homepage', checkNotAuthenticated, async (req, res)=> {
    try {
        // 1. Kunin ang lahat ng benta
        const rawSales = await db(`SELECT MENU, CATEGORY, SUM(Qty) as totalQty FROM sellout GROUP BY MENU, CATEGORY`);
        
        console.log("[DEBUG HOMEPAGE] Raw Sales from DB:", rawSales);
        // 2. Kunin ang lahat ng menu items para sa matching ng images
        const rawMenuItems = await db(`SELECT * FROM menu`);
        // I-normalize ang menu items para siguradong makuha ang 'MENU_NAME', 'ID', at 'MENU_IMAGE'
        const normalizedMenu = rawMenuItems.map(m => normalizeUser(m));
        console.log("[DEBUG HOMEPAGE] Normalized Menu Items from DB (ID, Name, Image status):", normalizedMenu.map(m => ({ ID: m.ID, MENUNAME: m['MENU NAME'], IMAGE_EXISTS: !!m.MENU_IMAGE })));
        const cleanedMap = new Map();

        // Helper function para linisin ang pangalan para sa matching
        const getBaseName = (name) => {
            if (!name) return '';
            return name.replace(/\b(grande|regular)\b/gi, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        };

        rawSales.forEach(item => {
            const cleanName = getBaseName(item.MENU);
            
            // 2. Pagsamahin ang quantities kung pareho na ang Clean Name
            if (cleanedMap.has(cleanName)) {
                cleanedMap.get(cleanName).totalQty += Number(item.totalQty);
            } else {
                cleanedMap.set(cleanName, { 
                    ...item, 
                    MENU: cleanName,
                    totalQty: Number(item.totalQty)
                });
            }
        });

        // 3. I-convert pabalik sa array, i-sort by highest sales, at kumuha lang ng Top 6
        const processedSellers = Array.from(cleanedMap.values())
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 6)
            .map(item => {
                // Hanapin ang saktong Menu Item gamit ang normalized keys para makuha ang Image
                const cleanSearchName = getBaseName(item.MENU);
                const matchedMenu = normalizedMenu.find(m => {
                    const dbName = m['MENU NAME'] || m['MENU_NAME'] || m['MENU'] || '';
                    return getBaseName(dbName) === cleanSearchName;
                });

                const itemId = matchedMenu ? matchedMenu.ID : null;
                const hasImage = matchedMenu ? matchedMenu.MENU_IMAGE : null;

                return {
                    ...item,
                    menu_image: (hasImage && itemId) ? `/menu-image/${itemId}` : null
                };
            });

        res.render('homepage', { bestSellers: processedSellers });
    } catch (e) {
        console.error("Error fetching best sellers for homepage:", e);
        res.render('homepage', { bestSellers: [] });
    }
})

//user page
app.get('/userpage', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    console.log(`[ROUTE] /userpage accessed by ${user.USERNAME}. Role detected: ${user.CATEGORY}`);

    if (user.CATEGORY === 'ADMIN') {
        console.log("[DEBUG] Redirecting ADMIN to /adminpage");
        return res.redirect('/adminpage');
    }

    // Strict check: Kung HINDI 'USER', sipain pabalik sa login
    if (user.CATEGORY !== 'USER') {
        console.log(`[DEBUG] Unauthorized role (${user.CATEGORY}). Logging out.`);
        req.logOut((err) => {
            if (err) console.error(err);
            return res.redirect('/login');
        });
        return;
    }

    // KUNIN ANG DATA MULA SA 'inventory' TABLE
   let items = [];
   let dtrData = [];
   let employeeProfile = {}; // Variable para sa employee details
   let menuItems = []; // Variable para sa menu items
   let transactionData = []; // Variable para sa transaction history
   let faceDescriptor = null; // Variable para sa face data
   let username; // Declare username here
    try {
        username = user.USERNAME; // Assign username inside the try block
        items = await db('SELECT `DATE`, `ITEM_NAME`, `ITEM_CATEGORY`, `UNIT_OF_MEASURE`, `STOCK_ONHAND`, `USERNAME` FROM inventory WHERE USERNAME = ? ORDER BY id DESC', [user.USERNAME]);

        // Fetch DTR data for the table
        const rawDtrData = await db('SELECT * FROM dtr WHERE USERNAME = ? ORDER BY DATE DESC', [user.USERNAME]);

        // KUNIN ANG FACE DESCRIPTOR NG USER
        try {
            const accountData = await db('SELECT face_descriptor FROM accounts WHERE username = ?', [user.USERNAME]);
            if (accountData.length > 0 && accountData[0].face_descriptor) {
                faceDescriptor = accountData[0].face_descriptor;
            }
        } catch (e) { console.log("Error fetching face descriptor:", e); }

        // KUNIN ANG EMPLOYEE DETAILS (Kung meron na sa database)
        try {
            // FIX: Gumamit ng UPPER(TRIM()) para mag-match sa logic ng POST route
            const profileResult = await db('SELECT * FROM `employee deatails` WHERE UPPER(TRIM(USERNAME)) = UPPER(TRIM(?))', [user.USERNAME]);
            if (profileResult.length > 0) {
                let normalizedProfile = normalizeUser(profileResult[0]);
                
                // Agresibong check para sa Base64 data mula sa database
                let rawPic = normalizedProfile.PROFILE_PIC ? normalizedProfile.PROFILE_PIC.toString().trim() : '';
                
                if (rawPic.startsWith('data:')) {
                    normalizedProfile.PROFILE_PIC = rawPic;
                    console.log(`[DEBUG /userpage] Loaded Base64 profile pic for ${user.USERNAME}`);
                } else if (rawPic && rawPic !== 'null' && rawPic !== '') {
                    normalizedProfile.PROFILE_PIC = rawPic.startsWith('http') ? rawPic : `/uploads/${rawPic}`;
                } else {
                    normalizedProfile.PROFILE_PIC = '/default-avatar.png';
                }
                employeeProfile = normalizedProfile;
            } else {
                employeeProfile = { PROFILE_PIC: '/default-avatar.png' }; // Fallback kung walang record
                console.log("[DEBUG /userpage] Using default profile pic (no record or empty).");
            }
        } catch (err) {
            // Ignore error kung wala pang table, gagawin ito sa POST route
        }

        // KUNIN ANG MENU ITEMS
        try {
            menuItems = await db('SELECT * FROM menu');
            // Safe mapping para sa User Page
            menuItems = menuItems.map(m => ({
                ...m,
                id: m.id !== undefined ? m.id : (m.ID !== undefined ? m.ID : null),
                'Menu Name': m['Menu Name'] || m['Menu name'],
                'Category 2': m['Category 2'] || '',
                menu_image: (m.menu_image || m.MENU_IMAGE) ? `/menu-image/${m.id !== undefined ? m.id : m.ID}` : null
            }));
        } catch(e) { console.error("Menu fetch error:", e); }

        // KUNIN ANG TRANSACTION HISTORY (sellout table)
        try {
            // Filter: Ipakita lang ang transactions kung saan ang USERNAME ay match sa naka-login
            transactionData = await db('SELECT * FROM sellout WHERE USERNAME = ? ORDER BY TIMESTAMP DESC', [user.USERNAME]);
        } catch (e) {
            console.log("Transaction table might not exist yet or empty.");
        }

        // I-format ang DTR data para mas malinis sa EJS
        dtrData = rawDtrData.map(record => {
            const dateObj = new Date(record.DATE);
            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // e.g., '01' for January
            const day = dateObj.getDate().toString().padStart(2, '0');

            // Super Safe ID detection: Hahanapin ang ID key kahit ano pa ang pagkakasulat (id, ID, Id)
            const recordId = record.id || record.ID || record.Id || record.iD || null;
            
            return {
                ...record,
                formattedDate: `${year}-${month}-${day}`, // Para sa display
                month: month, // Para sa data-month attribute
                // Huwag i-embed ang buong Base64. Magbigay lang ng URL para i-fetch ito.
                time_in_image: (record.time_in_image && recordId) ? `/attendance-image/${recordId}/in` : null,
                time_out_image: (record.time_out_image && recordId) ? `/attendance-image/${recordId}/out` : null
            };
        });

        console.log("Items from DB:", items); // Debugging: Check if data is retrieved
    } catch (e) {
        console.error("Error fetching data:", e);
        req.flash('error', 'Could not load data.');
        items = []; // Ensure items is an empty array in case of error
        dtrData = [];
    } 
    res.render('userpage', {
        USERNAME: user.USERNAME, // Ensure username is passed
        CATEGORY: user.CATEGORY,
        items: items, // Ipasa ang 'items' sa EJS file
        dtrData: dtrData, // Pass DTR data to EJS
        employeeProfile: employeeProfile, // Ipasa ang profile data sa EJS para ma-display
        menuItems: menuItems, // Ipasa ang menuItems sa EJS
        transactionData: transactionData, // Ipasa ang transactionData sa EJS
        errors: req.flash('error'),
        success: req.flash('success'),
        faceDescriptor: faceDescriptor // IPASA ANG FACE DATA SA USER PAGE
    });
});

// Admin page
app.get('/adminpage', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);

    // Strict check: Kung HINDI 'ADMIN', sipain pabalik sa login
    if (user.CATEGORY !== 'ADMIN') {
        return res.redirect('/login');
    }
    
    // Get Filter Parameters
    const selectedMonth = req.query.month;
    const selectedYear = req.query.year;

    let items = [];
    let menuItems = []; // Variable para sa menu list
    let selloutData = []; // Variable para sa sellout reports
    let dtrData = []; // Variable para sa attendance reports
    let analyticsData = {
        totalSales: 0,
        totalItemsSold: 0,
        transactionCount: 0,
        bestSeller: 'N/A',
        salesByCategory: [],
        salesByCategory2: [], // Variable para sa Category 2 sales
        lowStockCount: 0,
        usersOnDuty: 0,
        salesByMonth: [], // Initialize variable for monthly sales
        salesByDaily: [],  // Initialize variable for daily sales trend
        salesByMonthCat2: [], // NEW: Monthly trend for Category 2
        salesByDailyCat2: [], // NEW: Daily trend for Category 2
        attendanceStats: { Present: 0, Late: 0, Undertime: 0, HalfDay: 0 }, // Initialize attendance stats
        latesPerUser: {} // NEW: Track lates per user
    };
    let employeeProfile = {}; // Variable para sa profile data
    
    // --- PREPARE DATE FILTER SQL ---
    let dateFilterSql = "";
    let dateParams = [];
    let dateFilterSqlForMonthly = ""; // Specific filter for Monthly Trend graphs (Year only)
    let dateParamsForMonthly = [];
    let dtrFilterSql = ""; 
    let dtrParams = [];

    try {
        // Fetch all items from the inventory table
        items = await db('SELECT * FROM inventory ORDER BY id DESC', []);

        // REVISED INVENTORY FOR ADMIN: Add Remarks for Low Stock
        items = items.map(item => {
            // Gumawa ng copy ng item para siguradong pwedeng i-edit (avoid read-only error)
            const newItem = { ...item };
            
            // FIX: Siguraduhing may 'id' property (case-insensitive handling)
            if (!newItem.id && newItem.ID) {
                newItem.id = newItem.ID;
            }

            // CHECK: Kung may naka-save na "NEW STOCKS" sa database (case-insensitive check)
            const dbRemarks = newItem.remarks || newItem.REMARKS || '';
            if (dbRemarks === 'NEW STOCKS') {
                newItem.REMARKS = 'NEW STOCKS';
            } else {
                // Fallback: I-check kung mababa na ang stock (Halimbawa: 20 pababa)
                const stock = parseFloat(newItem.STOCK_ONHAND || newItem.stock_onhand || 0);
                newItem.REMARKS = (stock <= 20) ? 'LOW STOCK' : 'GOOD'; 
            }
            return newItem;
        });

        // --- ANALYTICS DATA COMPUTATION ---
        // 1. Bilangin ang low stock items mula sa inventory data
        analyticsData.lowStockCount = items.filter(item => (item.REMARKS === 'LOW STOCK')).length;
        
        if (selectedYear) {
            dateFilterSql += " AND YEAR(TIMESTAMP) = ?";
            dateParams.push(selectedYear);
            dateFilterSqlForMonthly += " AND YEAR(TIMESTAMP) = ?";
            dateParamsForMonthly.push(selectedYear);
            dtrFilterSql += " AND YEAR(`DATE`) = ?";
            dtrParams.push(selectedYear);
        }

        if (selectedMonth) {
            dateFilterSql += " AND MONTH(TIMESTAMP) = ?";
            dateParams.push(selectedMonth);
            // Note: We DO NOT add month filter to dateFilterSqlForMonthly
            // so the Monthly Graph still shows all months of the selected year.
            dtrFilterSql += " AND MONTH(`DATE`) = ?";
            dtrParams.push(selectedMonth);
        }

        // 2. Kunin ang data mula sa 'sellout' table
        try {
            // Kabuuang Benta, Items na nabenta, at bilang ng Transactions
            // Note: Added 'WHERE 1=1' to simplify appending AND conditions
            const salesSummary = await db(`SELECT SUM(\`Total Sellout\`) as totalSales, SUM(Qty) as totalItemsSold, COUNT(*) as transactionCount FROM sellout WHERE 1=1 ${dateFilterSql}`, [...dateParams]);
            if (salesSummary.length > 0) {
                // I-convert sa Number gamit ang parseFloat/parseInt para gumana ang .toFixed()
                analyticsData.totalSales = parseFloat(salesSummary[0].totalSales) || 0;
                analyticsData.totalItemsSold = parseInt(salesSummary[0].totalItemsSold) || 0;
                analyticsData.transactionCount = parseInt(salesSummary[0].transactionCount) || 0;
            }

            // Pinakamabentang Item (Best Seller)
            const bestSellerQuery = await db(`SELECT MENU, SUM(Qty) as totalQty FROM sellout WHERE 1=1 ${dateFilterSql} GROUP BY MENU ORDER BY totalQty DESC LIMIT 1`, [...dateParams]);
            if (bestSellerQuery.length > 0) {
                analyticsData.bestSeller = bestSellerQuery[0].MENU;
            }

            // Benta bawat Kategorya (para sa Chart)
            analyticsData.salesByCategory = await db(`SELECT CATEGORY, SUM(\`Total Sellout\`) as categorySales FROM sellout WHERE CATEGORY IS NOT NULL ${dateFilterSql} GROUP BY CATEGORY ORDER BY categorySales DESC`, [...dateParams]);

            // NEW: Benta bawat Category 2
            analyticsData.salesByCategory2 = await db(`SELECT \`CATEGORY 2\` as CATEGORY, SUM(\`Total Sellout\`) as categorySales FROM sellout WHERE \`CATEGORY 2\` IS NOT NULL AND \`CATEGORY 2\` != '' ${dateFilterSql} GROUP BY \`CATEGORY 2\` ORDER BY categorySales DESC`, [...dateParams]);

            // NEW: Monthly Sales Comparison (Line Graph)
            // Kinukuha ang Month at Year (e.g., "September 2023") at total sales
            analyticsData.salesByMonth = await db(`SELECT DATE_FORMAT(TIMESTAMP, '%Y-%m') as monthSort, DATE_FORMAT(TIMESTAMP, '%M %Y') as monthLabel, SUM(\`Total Sellout\`) as totalSales FROM sellout WHERE 1=1 ${dateFilterSqlForMonthly} GROUP BY monthSort, monthLabel ORDER BY monthSort ASC`, [...dateParamsForMonthly]);

            // NEW: Daily Sales Trend (Line Graph)
            // Kinukuha ang Araw (YYYY-MM-DD) at total sales
            analyticsData.salesByDaily = await db(`SELECT DATE_FORMAT(TIMESTAMP, '%Y-%m-%d') as dateLabel, SUM(\`Total Sellout\`) as totalSales FROM sellout WHERE 1=1 ${dateFilterSql} GROUP BY dateLabel ORDER BY dateLabel ASC`, [...dateParams]);
            
            // NEW: Monthly Sales Trend for Category 2
            analyticsData.salesByMonthCat2 = await db(`SELECT DATE_FORMAT(TIMESTAMP, '%Y-%m') as monthSort, DATE_FORMAT(TIMESTAMP, '%M %Y') as monthLabel, \`CATEGORY 2\` as category, SUM(\`Total Sellout\`) as totalSales FROM sellout WHERE \`CATEGORY 2\` IS NOT NULL AND \`CATEGORY 2\` != '' ${dateFilterSqlForMonthly} GROUP BY monthSort, monthLabel, category ORDER BY monthSort ASC`, [...dateParamsForMonthly]);

            // NEW: Daily Sales Trend for Category 2
            analyticsData.salesByDailyCat2 = await db(`SELECT DATE_FORMAT(TIMESTAMP, '%Y-%m-%d') as dateLabel, \`CATEGORY 2\` as category, SUM(\`Total Sellout\`) as totalSales FROM sellout WHERE \`CATEGORY 2\` IS NOT NULL AND \`CATEGORY 2\` != '' ${dateFilterSql} GROUP BY dateLabel, category ORDER BY dateLabel ASC`, [...dateParams]);

        } catch (e) {
            console.log("Analytics data (sellout) could not be fetched. Table might be empty.", e.message);
        }

    } catch (e) {
        console.error("Error fetching inventory data for admin:", e);
        req.flash('error', 'Could not load inventory data.');
        items = []; // Ensure items is an empty array in case of error
    }

    // FETCH EMPLOYEE PROFILE (Para sa Account Section)
    try {
        const profileResult = await db('SELECT * FROM `employee deatails` WHERE USERNAME = ?', [user.USERNAME]);
        if (profileResult.length > 0) {
            let normalizedProfile = normalizeUser(profileResult[0]);
            
            if (normalizedProfile.PROFILE_PIC && normalizedProfile.PROFILE_PIC.toString().trim() !== "") {
                const picValue = normalizedProfile.PROFILE_PIC.toString().trim();
                normalizedProfile.PROFILE_PIC = (picValue.startsWith('http') || picValue.startsWith('data:')) ? picValue : `/uploads/${picValue}`;
            } else {
                normalizedProfile.PROFILE_PIC = '/default-avatar.png'; // Fallback
            }
            employeeProfile = normalizedProfile;
        } else {
            employeeProfile = { PROFILE_PIC: '/default-avatar.png' }; // Fallback
        }
    } catch (e) {
        console.log("Employee details table might not exist yet, ignoring.");
    }

    // FETCH MENU ITEMS
    try {
        menuItems = await db('SELECT * FROM menu ORDER BY id DESC', []);
        // Safe mapping para sa Admin Page
        menuItems = menuItems.map(m => ({
            ...m,
            id: m.id !== undefined ? m.id : (m.ID !== undefined ? m.ID : null),
            'Menu Name': m['Menu Name'] || m['Menu name'],
            'Category 2': m['Category 2'] || '', // Normalize Category 2
            menu_image: (m.menu_image || m.MENU_IMAGE) ? `/menu-image/${m.id !== undefined ? m.id : m.ID}` : null
        }));
    } catch (e) {
        console.log("Menu table might not exist yet, ignoring.");
    }

    // FETCH SELLOUT REPORTS
    try {
        selloutData = await db(`SELECT * FROM sellout WHERE 1=1 ${dateFilterSql} ORDER BY TIMESTAMP DESC`, [...dateParams]);
    } catch (e) {
        console.log("Sellout table might not exist yet, ignoring.");
    }

    // FETCH ATTENDANCE / DTR REPORTS
    try {
        const rawDtrData = await db(`SELECT * FROM dtr WHERE 1=1 ${dtrFilterSql} ORDER BY DATE DESC`, [...dtrParams]);
        
        // Reset counts for analytics
        analyticsData.attendanceStats = { Present: 0, Late: 0, Undertime: 0, HalfDay: 0 };
        analyticsData.latesPerUser = {}; // Reset user lates

        dtrData = rawDtrData.map(record => {
            // Format Date for display
            let dateStr = record.DATE;
            if (record.DATE && typeof record.DATE.getMonth === 'function') {
                 dateStr = record.DATE.toISOString().split('T')[0];
            }

            // --- CALCULATE STATUS & OVERTIME ---
            let status = 'PRESENT';
            let overtime = '--';
            
            const timeInStr = record['TIME IN'];
            const timeOutStr = record['TIME OUT'];

            if (timeInStr && timeOutStr) {
                // Convert HH:mm:ss to minutes
                const parseToMinutes = (t) => {
                    if(!t) return 0;
                    const [h, m] = t.split(':').map(Number);
                    return (h * 60) + m;
                };

                const inMins = parseToMinutes(timeInStr);
                const outMins = parseToMinutes(timeOutStr);
                let durationMins = outMins - inMins;

                // AUTOMATIC 1 HOUR BREAK DEDUCTION
                // Ibawas ang 1 oras (60 mins) sa total work hours bilang break time
                if (durationMins > 60) {
                    durationMins -= 60;
                }

                // Constants based on 8AM - 6PM schedule
                const START_SHIFT = 8 * 60; // 8:00 AM in minutes
                const END_SHIFT = 18 * 60;  // 6:00 PM in minutes
                const OT_THRESHOLD = 8 * 60; // 8 Hours in minutes
                
                let statusList = [];

                // Logic for Half Day (e.g., less than 5 hours work)
                if (durationMins < (5 * 60) && durationMins > 0) {
                    statusList.push('HALF DAY');
                    analyticsData.attendanceStats.HalfDay++;
                } else {
                    if (inMins > START_SHIFT) {
                        statusList.push('LATE');
                        analyticsData.attendanceStats.Late++;
                        
                        // NEW: Count Late per User
                        const uName = record.USERNAME || 'Unknown';
                        analyticsData.latesPerUser[uName] = (analyticsData.latesPerUser[uName] || 0) + 1;
                    }
                    if (outMins < END_SHIFT) {
                         statusList.push('UNDERTIME');
                         analyticsData.attendanceStats.Undertime++;
                    }
                }

                if (statusList.length > 0) status = statusList.join(' / ');
                else {
                    // If no issues, count as Present (Perfect Attendance)
                    analyticsData.attendanceStats.Present++;
                }

                // Overtime Logic (Starts after 6PM / 18:00)
                if (outMins > END_SHIFT) {
                    const otMinsTotal = outMins - END_SHIFT;
                    overtime = `${Math.floor(otMinsTotal / 60)} hrs ${otMinsTotal % 60} mins`;
                }
            } else if (timeInStr && !timeOutStr) {
                status = 'ON DUTY';
            }

            // Safe ID detection para sa Admin mapping
            const recordId = record.id !== undefined ? record.id : (record.ID !== undefined ? record.ID : (record.Id || null));
            
            return { 
                ...record, 
                formattedDate: dateStr, computedStatus: status, computedOvertime: overtime,
                // Admin mapping
                time_in_image: (record.time_in_image && recordId) ? `/attendance-image/${recordId}/in` : null,
                time_out_image: (record.time_out_image && recordId) ? `/attendance-image/${recordId}/out` : null
            };
        });
    } catch (e) {
        console.log("DTR table might not exist yet, ignoring.");
    }

    // This assumes you have an 'adminpage.ejs' in your 'views' folder.
    res.render('adminpage', {
        USERNAME: user.USERNAME,
        CATEGORY: user.CATEGORY,
        items: items,
        menuItems: menuItems, // Ipasa ang menuItems sa EJS
        selloutData: selloutData, // Ipasa ang selloutData sa EJS
        dtrData: dtrData, // Ipasa ang dtrData sa EJS
        employeeProfile: employeeProfile, // Ipasa ang profile data
        analyticsData: analyticsData, // Ipasa ang analytics data
        selectedMonth: selectedMonth, // Ipasa ang selected filter
        selectedYear: selectedYear
    });
});

// =================================================================
// MENU ROUTES
// =================================================================

app.post('/add-menu', checkAuthenticated, (req, res, next) => {
    uploadMenu(req, res, (err) => {
        if (err) {
            req.flash('error', 'Upload Error: ' + err.message);
            return res.redirect('/adminpage?tab=menu');
        }
        next();
    });
}, async (req, res) => {
    const user = normalizeUser(req.user);
    if (user.CATEGORY !== 'ADMIN') return res.redirect('/login');

    const menuName = req.body.menu;
    const category = req.body.category;
    const category2 = req.body.category2;
    const price = req.body.Price;
    // Convert image to Base64
    const menuImage = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null;

    try {
        await db("INSERT INTO menu (`Menu Name`, `Category`, `Category 2`, `Price`, `menu_image`) VALUES (?, ?, ?, ?, ?)", 
            [menuName, category, category2, price, menuImage]);
        req.flash('success', 'Menu item added successfully!');
    } catch (e) {
        console.error("Error adding menu:", e);
        
        if (e.message && e.message.includes("doesn't exist")) {
            try {
                await db(`CREATE TABLE IF NOT EXISTS menu (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    \`Menu Name\` VARCHAR(255),
                    \`Category\` VARCHAR(100),
                    \`Category 2\` VARCHAR(100),
                    \`Price\` DECIMAL(10,2),
                    \`menu_image\` LONGTEXT
                )`);
                await db("INSERT INTO menu (`Menu Name`, `Category`, `Category 2`, `Price`, `menu_image`) VALUES (?, ?, ?, ?, ?)", [menuName, category, category2, price, menuImage]);
                req.flash('success', 'Menu Table created and Item added!');
            } catch (err2) { req.flash('error', 'Database Error: ' + err2.message); }
        } else if (e.message && (e.message.includes("Unknown column") || e.message.includes("menu_image"))) {
            try {
                // Auto-fix: Add menu_image column
                await db("ALTER TABLE menu ADD COLUMN `menu_image` LONGTEXT");
                await db("INSERT INTO menu (`Menu Name`, `Category`, `Category 2`, `Price`, `menu_image`) VALUES (?, ?, ?, ?, ?)", [menuName, category, category2, price, menuImage]);
                req.flash('success', 'Database updated and Item added!');
            } catch (err3) { req.flash('error', 'Failed to update database: ' + err3.message); }
        } else { req.flash('error', 'Failed to add menu: ' + e.message); }
    }
    res.redirect('/adminpage?tab=menu');
});

// DELETE MENU ROUTE
app.delete('/delete-menu/:id', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    if (user.CATEGORY !== 'ADMIN') return res.redirect('/login');

    const { id } = req.params;
    try {
        await db("DELETE FROM menu WHERE id = ?", [id]);
        req.flash('success', 'Menu item deleted successfully!');
    } catch (e) {
        req.flash('error', 'Error deleting item: ' + e.message);
    }
    res.redirect('/adminpage?tab=menu');
});

// UPDATE MENU ROUTE
app.put('/update-menu', checkAuthenticated, (req, res, next) => {
    uploadMenu(req, res, (err) => {
        if (err) {
            req.flash('error', 'Upload Error: ' + err.message);
            return res.redirect('/adminpage?tab=menu');
        }
        next();
    });
}, async (req, res) => {
    const user = normalizeUser(req.user);
    if (user.CATEGORY !== 'ADMIN') return res.redirect('/login');

    const { id, menu, category, category2, Price } = req.body;
    // Convert new image to Base64 if uploaded
    const menuImage = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null;

    try {
        let updateQuery = "UPDATE menu SET `Menu Name` = ?, `Category` = ?, `Category 2` = ?, `Price` = ?";
        let updateParams = [menu, category, category2, Price];

        if (menuImage) {
            updateQuery += ", `menu_image` = ?";
            updateParams.push(menuImage);
        }

        updateQuery += " WHERE id = ?";
        updateParams.push(id);

        await db(updateQuery, updateParams);
        req.flash('success', 'Menu item updated successfully!');
    } catch (e) {
        req.flash('error', 'Error updating item: ' + e.message);
    }
    res.redirect('/adminpage?tab=menu');
});

// Route para sa "NEW STOCKS" Action (Check Box)
app.post('/mark-new-stock', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    
    // Security Check: Admin lang ang pwede mag-restock
    if (user.CATEGORY !== 'ADMIN') {
        return res.redirect('/login');
    }

    // FIX: Siguraduhing may ID na natanggap
    const { id } = req.body;
    console.log("[MARK-NEW-STOCK] Request received for Item ID:", id);

    if (!id) {
        req.flash('error', 'Error: Item ID is missing.');
        return res.redirect('/adminpage');
    }

    try {
        // I-update ang remarks column sa "NEW STOCKS"
        // Gamitin ang result para malaman kung may na-update
        const result = await db("UPDATE inventory SET remarks = 'NEW STOCKS' WHERE id = ?", [id]);
        console.log("[MARK-NEW-STOCK] Update Result:", result);
        req.flash('success', 'Item successfully marked as NEW STOCKS!');
    } catch (e) {
        console.error("[MARK-NEW-STOCK] Error:", e);
        // Auto-fix: Kung wala pang 'remarks' column ang inventory table, gagawin ito kusa
        if (e.message && e.message.includes("Unknown column")) {
            try {
                await db("ALTER TABLE inventory ADD COLUMN remarks VARCHAR(50)");
                await db("UPDATE inventory SET remarks = 'NEW STOCKS' WHERE id = ?", [id]);
                req.flash('success', 'Database Updated & Item marked as NEW STOCKS!');
            } catch (err2) {
                req.flash('error', 'Database Error: ' + err2.message);
            }
        } else {
            req.flash('error', 'Failed to update item: ' + e.message);
        }
    }
    res.redirect('/adminpage?tab=inventory');
});


app.get('/login',checkNotAuthenticated,(req,res) =>{
    res.render('login')
})

app.get('/register',checkNotAuthenticated,(req,res) =>{
    // 2. Ipasa ang flash messages sa register page
    res.render('register', { messages: req.flash() })
}) 

// 3. Gumawa ng bagong route para sa pag-send ng OTP
app.post('/send-otp', async (req, res) => {
    // Tanggapin ang email kahit 'EMAIL' o 'email' ang gamit sa frontend
    const EMAIL = req.body.EMAIL || req.body.email;
    if (!EMAIL) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes

        // I-save ang OTP at expiry sa session
        req.session.otp = otp;
        req.session.otpExpiry = otpExpiry;
        req.session.emailForOtp = EMAIL; // Security: I-save din ang email

        console.log(`Generated OTP for ${EMAIL}: ${otp}`);

        const subject = 'Your OTP for Registration';
        const message = `<p>Hello,</p><p>Your One-Time Password (OTP) is: <b>${otp}</b>. It is valid for 10 minutes.</p>`;

        const emailResult = await sendEmail(EMAIL, subject, message);

        if (emailResult.success) {
            res.json({ message: 'OTP has been sent to your email.' });
        } else {
            // Mag-log ng specific error galing sa mailsend.js para mas madali i-debug
            console.error("Error from sendEmail:", emailResult.error);
            res.status(500).json({ message: 'Failed to send OTP. Please check server logs for details.' });
        }
    } catch (e) {
        console.error("Error in /send-otp:", e);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// 4. Baguhin ang register route para i-verify ang OTP
app.post('/register', checkNotAuthenticated, async (req, res) => {
    try {
        const { USERNAME, PASSWORD, confirm_password, CATEGORY, EMAIL, OTP, face_descriptor } = req.body;
        
        // Check kung valid ang session
        if (!req.session) {
            throw new Error("Session is invalid or expired.");
        }
        const { otp: sessionOtp, otpExpiry, emailForOtp } = req.session;

        // --- Validations ---
        if (PASSWORD !== confirm_password) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('/register');
        }
        
        // Security Check: Siguraduhing ang OTP ay para sa tamang email
        if (!sessionOtp || emailForOtp !== EMAIL) {
            req.flash('error', 'Please request an OTP for this email address first.');
            return res.redirect('/register');
        }
        
        if (Date.now() > otpExpiry) {
            req.flash('error', 'OTP has expired. Please request a new one.');
            // Linisin ang expired OTP data sa session
            req.session.otp = null;
            req.session.otpExpiry = null;
            req.session.emailForOtp = null;
            return res.redirect('/register');
        }
        
        // Safe OTP Comparison (Convert to String and Trim)
        if (String(sessionOtp).trim() !== String(OTP).trim()) {
            req.flash('error', 'Invalid OTP.');
            return res.redirect('/register');
        }
        
        // FACE RECOGNITION CHECK
        if (!face_descriptor || face_descriptor.trim() === "") {
            req.flash('error', 'Face Registration is required! Please capture your face.');
            return res.redirect('/register');
        }

        // --- Registration Logic (after OTP is verified) ---
        const hashedPassword = await bcryptjs.hash(PASSWORD, 10);

        // Siguraduhing may 'email' column sa iyong 'accounts' table
        const query = "INSERT INTO accounts (username, password, confirm_password, category, email, face_descriptor) VALUES (?, ?, ?, ?, ?, ?)";
        const values = [USERNAME, hashedPassword, hashedPassword, CATEGORY, EMAIL, face_descriptor];

        await db(query, values);

        console.log("User registered successfully!");
        
        // Linisin ang OTP data
        req.session.otp = null;
        req.session.otpExpiry = null;
        req.session.emailForOtp = null;
        
        req.flash('success', 'Registration successful! You can now log in.');
        res.redirect('/login');

    } catch (e) {
        console.error("May error sa registration (Line ~520):", e);
        // Check for specific duplicate entry error
        if (e.code === 'ER_DUP_ENTRY') {
             req.flash('error', 'Registration failed. Username or email already exists.');
        } else {
             req.flash('error', 'Registration Error: ' + e.message);
        }
        return res.redirect('/register');
    }
});

app.delete('/logout',(req,res,next) =>{
    req.logOut(err =>{
        if(err) return next(err)
        res.redirect('homepage')
    })
})

app.post('/login', (req, res, next) => {
    // Note: Using a custom callback for passport to implement role-based redirection.
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        // If authentication fails (e.g., wrong password, user not found),
        // flash the error message and redirect to the login page.
        if (!user) {
            req.flash('error', info.message);
            return res.redirect('/login');
        }

        // Validate if the selected category matches the database category
        const checkUser = normalizeUser(user);
        if (req.body.CATEGORY && checkUser.CATEGORY !== req.body.CATEGORY) {
            req.flash('error', `Login failed: This account is not registered as ${req.body.CATEGORY}.`);
            return res.redirect('/login');
        }

        // If authentication is successful, establish a session.
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            const normalizedUser = normalizeUser(user);
            console.log("[LOGIN] User logged in:", normalizedUser);

            // Importante: I-save ang session bago mag-redirect para siguradong pasok ang data sa database
            req.session.save((err) => {
                if (err) return next(err);

                if (normalizedUser.CATEGORY === 'ADMIN') {
                    return res.redirect('/adminpage');
                } else if (normalizedUser.CATEGORY === 'USER') {
                    return res.redirect('/userpage');
                }
                
                req.logOut(err => {
                    if (err) return next(err);
                    req.flash('error', `User role is not defined. (DB Value: ${normalizedUser.CATEGORY})`);
                    res.redirect('/login');
                });
            });
        });
    })(req, res, next);
});

function checkAuthenticated(req, res, next){
    if(req.isAuthenticated()){
        return next()
    }
    res.redirect('/login')
}

function checkNotAuthenticated(req, res, next){
    if(req.isAuthenticated()){
        // Note: If a user is already logged in, redirect them to their correct page
        // instead of showing them the login/register page again.
        const user = normalizeUser(req.user);
        if (user.CATEGORY === 'ADMIN') {
            return res.redirect('/adminpage');
        } else if (user.CATEGORY === 'USER') {
            return res.redirect('/userpage');
        }
    }
    next()
}

// =================================================================
// INVENTORY ROUTES
// =================================================================

// Route para magdagdag ng item
app.post('/add-item', checkAuthenticated, async (req, res) => {
    // 1. DEBUG: I-log ang natatanggap na data para makita kung tama ang pasok
    console.log("Data na natanggap galing sa Form:", req.body);
     // Kunin ang username ng user na naka-login
    const user = normalizeUser(req.user);
    const username = user.USERNAME;

    // Kunin ang data mula sa form body
    // Gumamit ng fallback (||) para tanggapin kahit small letters ang name sa HTML
    const dateVal = req.body.DATE || req.body.date;
    const nameVal = req.body.ITEM_NAME || req.body.item_name || req.body.itemName;
    const catVal = req.body.ITEM_CATEGORY || req.body.item_category || req.body.category;
    const unitVal = req.body.UNIT_OF_MEASURE || req.body.unit_of_measure || req.body.unit;
    const stockVal = req.body.STOCK_ONHAND || req.body.stock_onhand || req.body.stock;

    // 2. CHECK: Kung may kulang na data
    if (!dateVal || !nameVal) {
        console.error("❌ ERROR: Missing Date or Item Name!");
        req.flash('error', 'Please complete the form (Date and Item Name are required).');
        return res.redirect('/userpage');
    }

    // 3. SQL query (Nilagyan ng backticks `` ang column names para iwas error sa 'DATE')
    const sql = `INSERT INTO inventory 
                 (\`DATE\`, \`ITEM_NAME\`, \`ITEM_CATEGORY\`, \`UNIT_OF_MEASURE\`, \`STOCK_ONHAND\`, \`USERNAME\`) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [dateVal, nameVal, catVal, unitVal, stockVal, username];

    try {
        await db(sql, values);
        console.log("✅ Item added successfully:", values);
        res.redirect('/userpage?tab=inventory'); // Redirect na may tab parameter
    } catch (err) {
        console.error("❌ Database Error:", err.message);
        req.flash('error', 'Error adding item to database.');
        res.redirect('/userpage?tab=inventory');  
    }
});

// =================================================================
// EMPLOYEE DETAILS / EDIT PROFILE ROUTE
// =================================================================

app.post('/update-profile', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    const TABLE_NAME = "`employee deatails`"; // Gumagamit ng backticks para sa table name na may space/typo
    let profilePicUrl = null; // Default to null
    const redirectPath = user.CATEGORY === 'ADMIN' ? '/adminpage?tab=account' : '/userpage?tab=account';

    try {
        // 1. I-handle ang Multer upload bilang Promise
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 2. Kung may file, i-convert sa Base64 string para i-save sa Database
        if (req.file) {
            // FIX: Added missing backticks for template literal interpolation
            profilePicUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            console.log(`[PROFILE UPDATE] File detected: ${req.file.originalname}, Size: ${req.file.size} bytes`);
        }
    } catch (err) {
        console.error("Profile Upload Error:", err);
        req.flash('error', 'Upload Failed: ' + err.message);
        return res.redirect(redirectPath);
    }
    
    // 1. VARIABLE MAPPING - Mas malawak na fallbacks para siguradong makuha ang data mula sa form
    const fName = req.body.first_name || req.body.firstName || req.body.firstname || req.body.fName || '';
    const lName = req.body.last_name || req.body.lastName || req.body.lastname || '';

    // Flexible mapping para sa full_name, position, contact_no, home_address
    const fullName = req.body.full_name || req.body.fullName || req.body.fullname || req.body.name || (`${fName} ${lName}`).trim() || 'No Name';
    const position = req.body.position || req.body.job_title || req.body.jobTitle || req.body.role || 'Employee';
    const contactNo = req.body.contact_no || req.body.contactNo || req.body.contact_number || req.body.contact || req.body.phone || '';
    const homeAddress = req.body.home_address || req.body.homeAddress || req.body.address || req.body.location || '';

    console.log(`[PROFILE UPDATE] Processing for: ${user.USERNAME} | Full Name: ${fullName}`);

    try {
        // 1. FORCE DATABASE FIX (Brute Force)
        // Siguraduhing may table. Kung wala, gagawin.
        await db(`CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (id INT AUTO_INCREMENT PRIMARY KEY)`);

        // 1.5. DROP UNIQUE INDEX FIX
        // Tinatanggal ang UNIQUE constraint sa full_name dahil nagdudulot ito ng error kapag may empty strings
        try {
            await db(`ALTER TABLE ${TABLE_NAME} DROP INDEX FULL_NAME_UNIQUE`);
            console.log("[DB FIX] Successfully removed UNIQUE constraint from full_name");
        } catch (err) {
            // Ignore error kung wala naman talagang index na ganito
        }

        // 2. MAINTENANCE: Siguraduhin na LONGTEXT ang profile_pic bago ang UPDATE/INSERT
        try {
            await db(`ALTER TABLE ${TABLE_NAME} MODIFY COLUMN profile_pic LONGTEXT`);
            console.log("[DB FIX] Enforced LONGTEXT on profile_pic column.");
        } catch (err) { console.log(`[DB NOTE] ${err.message}`); }

        // 2. COLUMN CHECK: Pipiliting i-add ang columns isa-isa.
        const columnsToAdd = [
            "ADD COLUMN USERNAME VARCHAR(255)",
            "ADD COLUMN full_name VARCHAR(255)",
            "ADD COLUMN position VARCHAR(100)",
            "ADD COLUMN contact_no VARCHAR(50)",
            "ADD COLUMN home_address TEXT",
            "ADD COLUMN profile_pic LONGTEXT"
        ];

        for (const colSql of columnsToAdd) {
            try {
                await db(`ALTER TABLE ${TABLE_NAME} ${colSql}`);
                console.log(`[DB FIX] Successfully added: ${colSql}`);
            } catch (err) {
                // Ignore error 1060 (Duplicate column) - Ibig sabihin okay na, meron na.
                if (err.errno !== 1060 && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_BAD_FIELD_ERROR') {
                    console.log(`[DB FIX WARNING] ${err.message}`);
                }
            }
        }

        // 3. SAVE PROCESS (Ngayon sigurado na tayong may columns)
        // Check kung may record na gamit ang dynamic TABLE_NAME
        // Gumamit ng UPPER at TRIM para sigurado sa matching ng USERNAME
        const check = await db(`SELECT * FROM ${TABLE_NAME} WHERE UPPER(TRIM(USERNAME)) = UPPER(TRIM(?))`, [user.USERNAME]);

        if (check.length > 0) {
            console.log("[PROFILE UPDATE] Existing record found. Updating...");
            
            let updateQuery = `UPDATE ${TABLE_NAME} SET full_name = ?, position = ?, contact_no = ?, home_address = ?`;
            let updateParams = [fullName, position, contactNo, homeAddress];

            // I-update lang ang picture kung may inupload na bago (Base64)
            if (profilePicUrl) {
                updateQuery += `, profile_pic = ?`;
                updateParams.push(profilePicUrl);
            }

            updateQuery += ` WHERE UPPER(TRIM(USERNAME)) = UPPER(TRIM(?))`;
            updateParams.push(user.USERNAME);

            await db(updateQuery, updateParams);
            req.flash('success', 'Profile Updated Successfully!');
        } else {
            console.log("[PROFILE UPDATE] No record found. Inserting new...");
            // Sa insert, isama ang Base64 data URI kung meron
            await db(`INSERT INTO ${TABLE_NAME} (USERNAME, full_name, position, contact_no, home_address, profile_pic) VALUES (?, ?, ?, ?, ?, ?)`, 
                [user.USERNAME, fullName, position, contactNo, homeAddress, profilePicUrl]);
            req.flash('success', 'Profile Created Successfully!');
        }
    } catch (e) {
        console.error("[PROFILE UPDATE] ERROR:", e);
        req.flash('error', 'Database Error: ' + e.message);
    }
    
    // Redirect base sa role ng user
    if (user.CATEGORY === 'ADMIN') {
        res.redirect('/adminpage?tab=account');
    } else {
        res.redirect('/userpage?tab=account'); 
    }
});

// =================================================================
// ATTENDANCE ROUTES (DTR)
// =================================================================

app.post('/time-in', checkAuthenticated, (req, res, next) => {
    uploadDTR(req, res, (err) => {
        if (err) { 
            return res.status(400).json({ success: false, message: 'Upload Error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    const user = normalizeUser(req.user);
    
    // PHILIPPINE TIME (UTC+8)
    const now = new Date();
    const phDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
    const phTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23' }).format(now);

    const dateStr = req.body.DATE || phDate;
    const timeStr = req.body.TIME || phTime;
    // Convert buffer to Base64 string para i-save sa database
    const imageBase64 = req.file ? `data:image/png;base64,${req.file.buffer.toString('base64')}` : null;
    const redirectUrl = user.CATEGORY === 'ADMIN' ? '/adminpage?tab=account&sub=Attendance' : '/userpage?tab=account&sub=Attendance';

    try {
        // Check if user already timed in today to prevent duplicates
        console.log(`[TIME-IN] Attempting for ${user.USERNAME} on ${dateStr}`);
        // Gumamit ng DATE() function sa SQL para sigurado na petsa lang ang kinukumpara (iwas oras mismatch)
        const exists = await db('SELECT * FROM dtr WHERE `USERNAME` = ? AND DATE(`DATE`) = ?', [user.USERNAME, dateStr]);
        
        if (exists.length === 0) {
            try {
                console.log(`[TIME-IN] No existing record found. Inserting new record with image.`);
                await db('INSERT INTO dtr (`USERNAME`, `DATE`, `TIME IN`, `time_in_image`) VALUES (?, ?, ?, ?)', [user.USERNAME, dateStr, timeStr, imageBase64]);
                req.flash('success', `Time In recorded at ${timeStr}`);
                // Send JSON response instead of redirecting immediately
                return res.json({ success: true, message: `Time In successful at ${timeStr}!`, redirectUrl: redirectUrl });
            } catch (err) {
                // Ito ang sasalo kapag nag-duplicate entry (halimbawa: double click nang mabilis)
                if (err.code === 'ER_DUP_ENTRY') {
                    req.flash('error', 'You have already timed in today.');
                    return res.json({ success: false, message: 'You have already timed in today.', redirectUrl: redirectUrl });
                }
                throw err; // I-throw ang ibang error kung hindi duplicate issue
            }
        } else {
            console.log(`[TIME-IN] Record already exists for today. Not inserting.`);
            req.flash('error', 'You have already timed in today.');
            return res.json({ success: false, message: 'You have already timed in today.', redirectUrl: redirectUrl });
        }
    } catch (e) {
        console.error("Error recording Time In:", e);
        // Iwasan ang paglalagay ng e.message sa flash kung malaki ang data
        const errMsg = e.message.includes('Unknown column') ? 'Database structure error. Please fix DB.' : 'Attendance failed. Try again.';
        req.flash('error', errMsg);
        return res.json({ success: false, message: errMsg, redirectUrl: redirectUrl });
    }
});

app.post('/time-out', checkAuthenticated, (req, res, next) => {
    uploadDTR(req, res, (err) => {
        if (err) { 
            return res.status(400).json({ success: false, message: 'Upload Error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    const user = normalizeUser(req.user);
    
    // PHILIPPINE TIME (UTC+8)
    const now = new Date();
    const phDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
    const phTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23' }).format(now);

    const dateStr = req.body.DATE || phDate;
    const timeStr = req.body.TIME || phTime;
    // Convert buffer to Base64 string
    const imageBase64 = req.file ? `data:image/png;base64,${req.file.buffer.toString('base64')}` : null;
    const redirectUrl = user.CATEGORY === 'ADMIN' ? '/adminpage?tab=account&sub=Attendance' : '/userpage?tab=account&sub=Attendance';

    try {
        console.log(`[TIME-OUT] Attempting for ${user.USERNAME} on ${dateStr}`);

        // 1. CHECK STATUS: Tignan kung naka-Time In na at kung WALA PANG Time Out
        const checkRecord = await db('SELECT * FROM dtr WHERE `USERNAME` = ? AND DATE(`DATE`) = ?', [user.USERNAME, dateStr]);

        if (checkRecord.length === 0) {
            // Wala pang Time In record
            req.flash('error', 'You must Time In before you can Time Out.');
            return res.json({ success: false, message: 'You must Time In before you can Time Out.', redirectUrl: redirectUrl });
        } else if (checkRecord[0]['TIME OUT']) {
            // Meron nang laman ang TIME OUT column (Bawal na ulitin)
            req.flash('error', 'You have already timed out today.');
            return res.json({ success: false, message: 'You have already timed out today.', redirectUrl: redirectUrl });
        }

        // 2. UPDATE RECORD: Kung valid pa, i-record ang Time Out
        await db('UPDATE dtr SET `TIME OUT` = ?, `time_out_image` = ? WHERE `USERNAME` = ? AND DATE(`DATE`) = ?', [timeStr, imageBase64, user.USERNAME, dateStr]);

        console.log(`[TIME-OUT] Record updated successfully.`);
        req.flash('success', `Time Out recorded at ${timeStr}`);
        return res.json({ success: true, message: `Time Out successful at ${timeStr}!`, redirectUrl: redirectUrl });
    } catch (e) {
        console.error("Error recording Time Out:", e);
        const errMsg = e.message.includes('Unknown column') ? 'Database structure error. Please fix DB.' : 'Attendance failed. Try again.';
        req.flash('error', errMsg);
        return res.json({ success: false, message: errMsg, redirectUrl: redirectUrl });
    }
});

// NEW ROUTE: I-serve ang image galing DB para iwas Error 431
app.get('/attendance-image/:id/:type', checkAuthenticated, async (req, res) => {
    const { id, type } = req.params;
    const col = type === 'in' ? 'time_in_image' : 'time_out_image';
    try {
        // Check both lowercase and uppercase ID columns just in case
        const rows = await db(`SELECT ?? as img FROM dtr WHERE id = ? OR ID = ?`, [col, id, id]);
        if (rows.length > 0 && rows[0].img) {
            const data = rows[0].img.toString().trim();
            if (data.startsWith('data:image')) {
                // I-convert ang Base64 string pabalik sa binary Buffer para ma-download
                const matches = data.toString().trim().match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) return res.status(400).send("Invalid image format.");

                const mimeType = matches[1];
                const base64Content = matches[2];
                const buffer = Buffer.from(base64Content, 'base64');
                const extension = mimeType.split('/')[1] || 'png';

                // Force download headers
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="attendance_${type}_${id}.${extension}"`);
                return res.send(buffer);
            } else {
                // Fallback para sa mga lumang record na filename lang ang nasa DB
                if (!data || data === 'null') return res.status(404).send("No image data found.");
                
                const filePath = path.join(__dirname, 'Public', 'uploads', data);
                if (fs.existsSync(filePath)) {
                    return res.download(filePath, `attendance_${type}_${id}.png`);
                }
                res.status(404).send("Image data not found on server.");
            }
        } else {
            res.status(404).send("Photo not found.");
        }
    } catch (e) {
        console.error("Image Fetch Error:", e);
        res.status(500).send("Server Error");
    }
});

// NEW ROUTE: I-serve ang Menu Image galing DB para ma-download
// INALIS ang checkAuthenticated para ma-view ng public/guests ang images sa homepage
app.get('/menu-image/:id', async (req, res) => {
    const { id } = req.params;
    const isDownload = req.query.download === 'true'; // Check if download is requested
    try {
        const rows = await db(`SELECT menu_image FROM menu WHERE id = ? OR ID = ?`, [id, id]);
        if (rows.length > 0 && rows[0].menu_image) {
            const data = rows[0].menu_image.toString().trim();
            if (data.startsWith('data:image')) {
                const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) return res.status(400).send("Invalid image format.");
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const extension = mimeType.split('/')[1] || 'png';

                res.setHeader('Content-Type', mimeType);
                // Switch between inline (for display) and attachment (for download)
                res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="menu_item_${id}.${extension}"`);
                return res.send(buffer);
            }
        }
        res.status(404).send("Image not found.");
    } catch (e) {
        res.status(500).send("Server Error");
    }
});

// FAIL-SAFE: Redirect kung sakaling may /uploads/ pa rin na prefix galing sa EJS link
app.get(['/uploads/attendance-image/:id/:type', '/uploads//attendance-image/:id/:type'], checkAuthenticated, (req, res) => {
    const { id, type } = req.params;
    res.redirect(`/attendance-image/${id}/${type}`);
});

// =================================================================
// TRANSACTION / SELLOUT ROUTES
// =================================================================

app.post('/place-order', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    const { cart } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // PHILIPPINE TIME (UTC+8) para sa Order Timestamp
    const now = new Date();
    const phDateTime = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Asia/Manila', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23'
    }).format(now).replace(/, /g, ' ');

    try {
        // Siguraduhing may table na 'sellout' na may tamang columns
        await db(`CREATE TABLE IF NOT EXISTS sellout (
            ID INT AUTO_INCREMENT PRIMARY KEY,
            USERNAME VARCHAR(255),
            TIMESTAMP DATETIME,
            MENU VARCHAR(255),
            CATEGORY VARCHAR(100),
            \`CATEGORY 2\` VARCHAR(100),
            Price DECIMAL(10,2),
            Qty INT,
            \`Total Sellout\` DECIMAL(10,2)
        )`);

        // Auto-fix: Add USERNAME column if missing (for existing tables)
        try {
            await db("ALTER TABLE sellout ADD COLUMN USERNAME VARCHAR(255)");
        } catch (err) {
            // Ignore error if column already exists
        }

        // I-insert ang bawat item sa cart papunta sa database
        for (const item of cart) {
            const totalSellout = parseFloat(item.price) * parseInt(item.qty);
            await db('INSERT INTO sellout (USERNAME, TIMESTAMP, MENU, CATEGORY, `CATEGORY 2`, Price, Qty, `Total Sellout`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
                [user.USERNAME, phDateTime, item.name, item.category, item.category2, item.price, item.qty, totalSellout]);
        }

        res.json({ success: true, message: 'Order placed and saved successfully!' });
    } catch (e) {
        console.error("Error placing order:", e);
        res.status(500).json({ success: false, message: 'Database Error: ' + e.message });
    }
});

// DOWNLOAD SELLOUT REPORT ROUTE (CSV/Excel)
app.get('/download-sellout', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    
    // Security Check: Admin lang ang pwede mag-download
    if (user.CATEGORY !== 'ADMIN') {
        return res.redirect('/login');
    }

    try {
        const selloutData = await db('SELECT * FROM sellout ORDER BY TIMESTAMP DESC');
        
        // 1. Gumawa ng bagong Workbook at Worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sellout Report');

        // 2. I-set ang Columns (Headers at Width)
        worksheet.columns = [
            { header: 'TIMESTAMP', key: 'TIMESTAMP', width: 25 },
            { header: 'USERNAME', key: 'USERNAME', width: 20 },
            { header: 'MENU', key: 'MENU', width: 25 },
            { header: 'CATEGORY', key: 'CATEGORY', width: 15 },
            { header: 'CATEGORY 2', key: 'CATEGORY 2', width: 20 },
            { header: 'PRICE', key: 'Price', width: 15 },
            { header: 'QTY', key: 'Qty', width: 10 },
            { header: 'TOTAL SELLOUT', key: 'Total Sellout', width: 20 }
        ];

        // 3. I-add ang mga Rows
        selloutData.forEach(row => {
            // I-format ang date para maging string (para hindi maging raw number sa Excel)
            const formattedRow = { ...row };
            if (row.TIMESTAMP) {
                formattedRow.TIMESTAMP = new Date(row.TIMESTAMP).toLocaleString();
            }
            worksheet.addRow(formattedRow);
        });

        // 4. Lagyan ng Styling ang Header (Bold + Gray Background)
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' } // Light Gray
        };

        // 5. I-send ang file bilang .xlsx
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Sellout_Report.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (e) {
        console.error("Error generating report:", e);
        req.flash('error', 'Failed to generate report.');
        res.redirect('/adminpage');
    }
});


// DOWNLOAD ATTENDANCE REPORT ROUTE (Excel)
app.get('/download-attendance', checkAuthenticated, async (req, res) => {
    const user = normalizeUser(req.user);
    
    // Security Check: Admin lang ang pwede mag-download
    if (user.CATEGORY !== 'ADMIN') {
        return res.redirect('/login');
    }

    try {
        const dtrData = await db('SELECT * FROM dtr ORDER BY DATE DESC');
        
        // 1. Gumawa ng bagong Workbook at Worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Report');

        // 2. I-set ang Columns
        worksheet.columns = [
            { header: 'DATE', key: 'formattedDate', width: 15 },
            { header: 'USERNAME', key: 'USERNAME', width: 20 },
            { header: 'TIME IN', key: 'TIME IN', width: 15 },
            { header: 'TIME OUT', key: 'TIME OUT', width: 15 },
            { header: 'STATUS', key: 'STATUS', width: 25 },
            { header: 'OVERTIME (>6PM)', key: 'OVERTIME', width: 20 }
        ];

        // 3. I-add ang mga Rows kasama ang Computation
        dtrData.forEach(row => {
            let dateStr = row.DATE;
            if (row.DATE && typeof row.DATE.getMonth === 'function') {
                 dateStr = row.DATE.toISOString().split('T')[0];
            }

            // --- REUSE STATUS & OVERTIME LOGIC ---
            let status = 'PRESENT';
            let overtime = '--';
            const timeInStr = row['TIME IN'];
            const timeOutStr = row['TIME OUT'];

            if (timeInStr && timeOutStr) {
                const parseToMinutes = (t) => {
                    if(!t) return 0;
                    const [h, m] = t.split(':').map(Number);
                    return (h * 60) + m;
                };
                const inMins = parseToMinutes(timeInStr);
                const outMins = parseToMinutes(timeOutStr);
                let durationMins = outMins - inMins;

                // BREAK DEDUCTION
                if (durationMins > 60) durationMins -= 60;

                const START_SHIFT = 8 * 60; 
                const END_SHIFT = 18 * 60; 
                let statusList = [];

                if (durationMins < (5 * 60) && durationMins > 0) statusList.push('HALF DAY');
                else {
                    if (inMins > START_SHIFT) statusList.push('LATE');
                    if (outMins < END_SHIFT) statusList.push('UNDERTIME');
                }
                if (statusList.length > 0) status = statusList.join(' / ');

                // OVERTIME (After 6PM)
                if (outMins > END_SHIFT) {
                    const otMinsTotal = outMins - END_SHIFT;
                    overtime = `${Math.floor(otMinsTotal / 60)} hrs ${otMinsTotal % 60} mins`;
                }
            } else if (timeInStr && !timeOutStr) {
                status = 'ON DUTY';
            }

            worksheet.addRow({
                formattedDate: dateStr,
                USERNAME: row.USERNAME,
                'TIME IN': row['TIME IN'],
                'TIME OUT': row['TIME OUT'],
                STATUS: status,
                OVERTIME: overtime
            });
        });

        // 4. Styling
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
        };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Attendance_Report.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (e) {
        console.error("Error generating attendance report:", e);
        req.flash('error', 'Failed to generate report.');
        res.redirect('/adminpage');
    }
});

// Route to manually/automatically fix DTR columns if they are missing
app.get('/fix-dtr', checkAuthenticated, async (req, res) => {
    try {
        console.log("[FIX-DTR] Checking and repairing database table 'dtr'...");

        // 1. Create table if it doesn't exist
        await db(`CREATE TABLE IF NOT EXISTS dtr (
            id INT AUTO_INCREMENT PRIMARY KEY
        )`);

        // 2. Add columns if they are missing
        // We use individual ALTER statements wrapped in try-catch to safely handle "Duplicate column" errors
        const schemaUpdates = [
            "ALTER TABLE dtr ADD COLUMN `USERNAME` VARCHAR(255)",
            "ALTER TABLE dtr ADD COLUMN `DATE` DATE",
            "ALTER TABLE dtr ADD COLUMN `TIME IN` VARCHAR(50)",
            "ALTER TABLE dtr ADD COLUMN `TIME OUT` VARCHAR(50)",
            "ALTER TABLE dtr ADD COLUMN `time_in_image` LONGTEXT",
            "ALTER TABLE dtr ADD COLUMN `time_out_image` LONGTEXT"
        ];

        for (const query of schemaUpdates) {
            try {
                await db(query);
            } catch (err) {
                // Ignore error 1060: Duplicate column name (meaning column already exists, which is good)
                if (err.errno !== 1060) {
                    console.log(`[FIX-DTR] Notice: ${err.message}`);
                }
            }
        }

        req.flash('success', 'Database fixed! Columns have been synced. Please try Time In again.');
        res.redirect('/userpage?tab=account&sub=Attendance');
    } catch (e) {
        console.error("[FIX-DTR] Error:", e);
        req.flash('error', 'Failed to fix database: ' + e.message);
        res.redirect('/userpage?tab=account&sub=Attendance');
    }
});

// AUTO-UPDATE DATABASE ON STARTUP
// Ito ay automatic na magdaragdag ng columns para sa pictures (time_in_image, time_out_image) kung wala pa.
async function initializeDtrTable() {
    try {
        console.log("[DB CHECK] Verifying DTR table structure...");
        
        // CHECK ACCOUNTS TABLE FOR FACE RECOGNITION SUPPORT
        try {
            await db("ALTER TABLE accounts ADD COLUMN face_descriptor TEXT");
            console.log("[DB CHECK] Added 'face_descriptor' column to accounts table.");
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') console.log(`[DB NOTE] Accounts table check: ${err.message}`);
        }

        // 1. Siguraduhing may table na dtr
        await db(`CREATE TABLE IF NOT EXISTS dtr (id INT AUTO_INCREMENT PRIMARY KEY)`);

        // 2. Listahan ng columns na kailangang i-add
        const schemaUpdates = [
            "ALTER TABLE dtr ADD COLUMN `USERNAME` VARCHAR(255)",
            "ALTER TABLE dtr ADD COLUMN `DATE` DATE",
            "ALTER TABLE dtr ADD COLUMN `TIME IN` VARCHAR(50)",
            "ALTER TABLE dtr ADD COLUMN `TIME OUT` VARCHAR(50)",
            "ALTER TABLE dtr ADD COLUMN `time_in_image` LONGTEXT", // LONGTEXT para kasya ang Base64
            "ALTER TABLE dtr ADD COLUMN `time_out_image` LONGTEXT"  // LONGTEXT para kasya ang Base64
        ];

        // 3. I-execute ang pag-add ng columns (Ignored kapag meron na)
        for (const query of schemaUpdates) {
            try {
                await db(query);
            } catch (err) {
                // Ignore error 1060 (Duplicate column name) - ibig sabihin meron na, which is good.
                if (err.errno !== 1060 && err.code !== 'ER_DUP_FIELDNAME') {
                    console.log(`[DB NOTE] ${err.message}`);
                }
            }
        }

        // 3.1 FORCE DATE COLUMN TYPE
        // Ito ay para siguraduhin na ang DATE column ay talagang 'DATE' type at hindi 'VARCHAR' o 'DATETIME'
        try {
            await db("ALTER TABLE dtr MODIFY COLUMN `DATE` DATE");
            console.log("[DB CHECK] Enforced DATE type on dtr table.");
            
            // Siguraduhin na LONGTEXT ang columns kahit existing na sila
            try {
                await db("ALTER TABLE dtr MODIFY COLUMN `time_in_image` LONGTEXT");
                await db("ALTER TABLE dtr MODIFY COLUMN `time_out_image` LONGTEXT");
                console.log("[DB CHECK] Image columns modified to LONGTEXT.");
            } catch (err) { console.log(err.message); }

        } catch (err) {
            // Ignore errors (e.g., kung empty table o strict sql mode issues)
            console.log(`[DB NOTE] Date column modification: ${err.message}`);
        }
        
        // 3.5. CLEANUP DUPLICATES (Bago i-apply ang Unique Index)
        // Ito ang magbubura ng mga sobrang record (tatanggalin ang duplicate na mas bago/higher ID, ititira ang una).
        try {
            await db(`
                DELETE t1 FROM dtr t1
                INNER JOIN dtr t2 
                WHERE 
                    t1.id > t2.id AND 
                    t1.USERNAME = t2.USERNAME AND 
                    DATE(t1.DATE) = DATE(t2.DATE)
            `);
            console.log("[DB CLEANUP] Removed duplicate DTR entries (Kept the first entry).");
        } catch (err) {
            console.log("[DB CLEANUP ERROR] " + err.message);
        }

        // 4. UNIQUE CONSTRAINT (PINAKAMAHALAGA):
        // Ito ang pipigil sa duplicate na DATE para sa isang USERNAME sa database level.
        try {
            await db("ALTER TABLE dtr ADD UNIQUE INDEX `unique_attendance` (`USERNAME`, `DATE`)");
            console.log("[DB CHECK] Unique constraint added to DTR table (Prevents Duplicates).");
        } catch (err) {
            // Error 1061 o ER_DUP_KEYNAME ay okay lang (ibig sabihin meron na)
            if (err.errno !== 1061 && err.code !== 'ER_DUP_KEYNAME') {
                console.log(`[DB NOTE] Index check: ${err.message}`);
            }
        }
        
        console.log("[DB CHECK] DTR table is ready with image columns.");
    } catch (e) {
        console.error("[DB ERROR] Failed to initialize DTR table:", e);
    }
}

// Patakbuhin ang database check bago mag-start ang server
initializeDtrTable().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
