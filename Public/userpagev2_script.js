function updateGrid() {
    const sidebar = document.querySelector(".sidebar");
    const body = document.querySelector("body");
    if (!sidebar || !body) return;

    if (window.innerWidth <= 1024) {
        body.style.gridTemplateColumns = ""; 
        return;
    }

    body.style.gridTemplateColumns = sidebar.classList.contains("close") 
        ? "75px 1fr" 
        : "280px 1fr";
}

//for section

function openSection(sectionId) {
    // 1. Kunin lahat ng elements na may class na 'tab-content'
    const sections = document.querySelectorAll('.tab-content');

    // 2. I-hide lahat ng sections
    sections.forEach(section => {
        section.style.display = 'none';
    });

    // 3. Ipakita lang ang section na pinindot (gamit ang ID)
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.style.display = 'block';
    }
}


function toggleForm(formId) {
    // Listahan ng lahat ng IDs ng containers mo
    const allForms = ["Attendance", "edit_profile", "myAddItemForm", "add-menu", "edit-menu"]
    var targetContainer = document.getElementById(formId);
    
    // 2. I-check muna kung bukas na ba siya (para ma-close kung i-click ulit)
    var isCurrentlyOpen = targetContainer && targetContainer.style.display === "block";

    // 3. ISARA LAHAT (Dito mangyayari ang "mag-cloclose yung isang section")
    allForms.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = "none";
        }
    });

    // 4. BUKSAN LANG YUNG PINILI (pero kung bukas na siya kanina, hayaan na lang siyang sarado)
    if (!isCurrentlyOpen && targetContainer) {
        targetContainer.style.display = "block";
    } else if (!targetContainer) {
        console.warn(`Warning: Element with ID '${formId}' not found.`);
    }
}

// Function para ma-view ang DTR Image nang hindi nagkaka-error 431
function viewDtrImage(imageUrl) {
    if (!imageUrl || imageUrl === '' || imageUrl.includes('null') || imageUrl.includes('undefined')) {
        alert("No photo recorded for this attendance.");
        return;
    }

    // ULTRA-CLEAN: Hanapin ang '/attendance-image/' at burahin lahat ng nasa unahan nito
    let cleanUrl = imageUrl;
    if (imageUrl.includes('/attendance-image/')) {
        const index = imageUrl.indexOf('/attendance-image/');
        cleanUrl = imageUrl.substring(index);
    }

    // Siguraduhing absolute path ang itatawag para hindi maligaw ang browser
    window.location.href = window.location.origin + cleanUrl;
}

// Function para ma-download ang Menu Image
function downloadMenuImage(imageUrl) {
    if (!imageUrl || imageUrl === '' || imageUrl.includes('null') || imageUrl.includes('undefined')) {
        alert("No image available for this item.");
        return;
    }
    // Direct trigger ng download mula sa route
    let cleanUrl = imageUrl;
    if (imageUrl.includes('/menu-image/')) {
        const index = imageUrl.indexOf('/menu-image/');
        cleanUrl = imageUrl.substring(index);
    }
    
    // Append ?download=true para mag-trigger ng attachment response mula sa server
    const separator = cleanUrl.includes('?') ? '&' : '?';
    window.location.href = window.location.origin + cleanUrl + separator + 'download=true';
}

// Function para buksan ang Edit Menu form at ilagay ang existing data
function openEditMenu(id, name, category, category2, price) {
    const form = document.getElementById('edit-menu-form');
    if(form) {
        // Populate form inputs
        // Fix: Use querySelector or elements array because 'form.id' refers to the form element's ID attribute, not the input named 'id'
        form.querySelector('input[name="id"]').value = id;
        form.menu.value = name;
        form.category.value = category; // Siguraduhing match ang value sa options (Case Sensitive)
        if(form.category2) form.category2.value = category2;
        form.Price.value = price;
        
        // Open the edit form container
        toggleForm('edit-menu');
    }
}

// Function para i-filter ang Menu Items sa User Page
function filterMenu(categoryName) {
    const cards = document.querySelectorAll('.menu-card');
    
    cards.forEach(card => {
        const itemCat = card.getAttribute('data-category');
        const searchKey = categoryName.toLowerCase().trim();
        
        // Kung 'all' ang pinili, ipakita lahat. Kung hindi, i-match ang category.
        if (searchKey === 'all' || (itemCat && itemCat.toLowerCase().trim() === searchKey)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Function to filter DTR table by month
        function filterDtrTable() {
            const monthSelect = document.getElementById('month');
            const selectedMonth = monthSelect.value;
            const tableBody = document.getElementById('dtrTableBody');
            const rows = tableBody.getElementsByTagName('tr');
            let hasVisibleRow = false;

            // Remove previous "No records found" message if exists
            const noRec = document.getElementById('no-rec-msg');
            if (noRec) noRec.remove();

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowMonth = row.getAttribute('data-month');
                
                // Skip processing if row doesn't have data-month (e.g. initial empty row)
                if (!rowMonth) continue;

                if (selectedMonth === "" || rowMonth === selectedMonth) {
                    row.style.display = "";
                    hasVisibleRow = true;
                } else {
                    row.style.display = "none";
                }
            }

            // Show message if no rows match the filter
            if (!hasVisibleRow && rows.length > 0) {
                const msgRow = document.createElement('tr');
                msgRow.id = 'no-rec-msg';
                msgRow.innerHTML = '<td colspan="3" class="no-records-cell">No records found for this month.</td>';
                tableBody.appendChild(msgRow);
            }
        }

// Function to download the visible table data as PDF
function downloadDTR() {
    try {
        // 1. Check if libraries are loaded
        if (typeof jsPDF === 'undefined') {
            alert('Error: jsPDF library not loaded. Please check your internet connection.');
            return;
        }

        const doc = new jsPDF();

        // 2. Check if autoTable plugin is attached
        if (typeof doc.autoTable !== 'function') {
            alert('Error: autoTable plugin not ready. Please reload the page.');
            return;
        }

        const table = document.getElementById("dtrTable");
        if (!table) {
            alert("Table not found!");
            return;
        }

        const head = [];
        const body = [];
        const title = "Daily Time Record Report";

        // Get table headers
        table.querySelectorAll("thead th").forEach(th => {
            head.push(th.innerText);
        });

        // Get visible table rows
        table.querySelectorAll("tbody tr").forEach(row => {
            // Skip hidden rows and "No records found"
            if (row.style.display === "none" || row.innerText.includes("No records found")) return;

            const rowData = [];
            row.querySelectorAll("td").forEach(td => {
                // Linisin ang text: Tanggalin ang camera emoji (📷) para hindi maging garbage characters sa PDF
                let cellText = td.innerText.replace(/📷/g, '').trim();
                rowData.push(cellText);
            });
            if (rowData.length > 0) body.push(rowData);
        });

        // Add title to the document
        doc.setFontSize(18);
        doc.text(title, 14, 20);

        // Generate the table using autoTable with Theme Colors
        doc.autoTable({ 
            head: [head], 
            body: body, 
            startY: 30,
            headStyles: { fillColor: [78, 52, 46] } // Dark Brown matching your theme
        });

        // Save the PDF
        doc.save("DTR_Report.pdf");

    } catch (error) {
        console.error("PDF Error:", error);
        alert("An error occurred: " + error.message);
    }
}

// ==========================================
// ORDER / CART FUNCTIONS
// ==========================================
let orderCart = [];

function addToOrder(name, price, category, category2) {
    // Check kung nasa cart na yung item
    const existingItem = orderCart.find(item => item.name === name);
    
    if (existingItem) {
        existingItem.qty++;
    } else {
        orderCart.push({ 
            name: name, 
            price: parseFloat(price), 
            qty: 1, 
            category: category || '', 
            category2: category2 || '' 
        });
    }
    renderCart();
}

function removeFromOrder(index) {
    if (orderCart[index].qty > 1) {
        orderCart[index].qty--;
    } else {
        orderCart.splice(index, 1);
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    
    if (!container || !totalEl) return;
    
    container.innerHTML = '';
    let total = 0;

    orderCart.forEach((item, index) => {
        total += item.price * item.qty;
        const itemTotal = (item.price * item.qty).toFixed(2);
        
        container.innerHTML += `
            <div class="cart-item">
                <div>
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-subtext">₱${item.price} x ${item.qty}</div>
                </div>
                <div class="cart-item-right">
                    <div class="cart-item-total-price">₱${itemTotal}</div>
                    <button onclick="removeFromOrder(${index})" class="cart-remove-btn">Remove</button>
                </div>
            </div>
        `;
    });

    if (orderCart.length === 0) {
        container.innerHTML = '<p class="cart-empty-message">No items selected.</p>';
    }

    totalEl.innerText = total.toFixed(2);
}

// Function to handle "Place Order" and print receipt
async function placeOrder() {
    const dutyInput = document.getElementById('isOnDutyStatus');
    // Mas safe na conversion: tignan kung 'true' ang laman ng input
    const isOnDuty = dutyInput && dutyInput.value === 'true';
    
    console.log("[ORDER CHECK] Duty Status:", isOnDuty, "| Raw Value:", dutyInput ? dutyInput.value : 'Element Missing');
    
    if (!isOnDuty) {
        alert("❌ TRANSACTION DENIED!\n\nYou must TIME-IN first (and not yet Timed-Out) before you can place an order. Please check your Attendance status.");
        return;
    }

    if (orderCart.length === 0) {
        alert("Cart is empty!");
        return;
    }

    if (!confirm("Confirm order and print receipt?")) return;

    // 1. SAVE TO DATABASE (via AJAX/Fetch)
    try {
        const response = await fetch('/place-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cart: orderCart })
        });

        const result = await response.json();

        if (!result.success) {
            alert("Failed to save order: " + result.message);
            return; // Huwag ituloy ang print kung failed ang save
        }
        
        // Kung success, proceed sa printing...
    } catch (err) {
        console.error("Order error:", err);
        alert("An error occurred while saving the order.");
        return;
    }

    // 2. GENERATE RECEIPT & PRINT
    let total = 0;
    // Display Philippine Time on the receipt
     const dateStr = new Date().toLocaleString("en-GB", { timeZone: "Asia/Manila", hour12: false, hourCycle: 'h23' });
    
    // Buuin ang HTML content ng Resibo
    let receiptHtml = `
        <html>
        <head>
            <title>Receipt</title>
            <style>
                body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; text-transform: uppercase; }
                .center { text-align: center; }
                .right { text-align: right; }
                .line { border-bottom: 1px dashed #000; margin: 10px 0; }
                .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .total { font-size: 1.2em; font-weight: bold; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="center">
                <h3>ITAEWON KOPI SHOP</h3>
                <p>Official Receipt<br>${dateStr}</p>
            </div>
            <div class="line"></div>
    `;

    orderCart.forEach(item => {
        total += item.price * item.qty;
        receiptHtml += `
            <div class="item">
                <span>${item.qty} x ${item.name}</span>
                <span>₱${(item.price * item.qty).toFixed(2)}</span>
            </div>
        `;
    });

    receiptHtml += `
            <div class="line"></div>
            <div class="item total">
                <span>TOTAL</span>
                <span>₱${total.toFixed(2)}</span>
            </div>
            <div class="center" style="margin-top: 20px;">
                <p>Thank you!</p>
            </div>
        </body>
        </html>
    `;

    // Buksan ang resibo sa bagong window at i-print
    const win = window.open('', '', 'width=400,height=600');
    win.document.write(receiptHtml);
    win.document.close();
    
    // Maghintay sandali bago mag-print para sure na loaded ang content
    setTimeout(() => {
        win.focus();
        win.print();
        win.close();
        
        // Linisin ang cart pagkatapos mag-print
        orderCart = [];
        renderCart();
    }, 500);
}

// ==========================================
// ATTENDANCE CAMERA FUNCTIONS
// ==========================================
let cameraStream = null;
let attendanceType = null; // 'in' or 'out'
let faceModelsLoaded = false;

// Load Models for Attendance
async function loadAttendanceModels() {
    if (faceModelsLoaded) return;
    
    try {
        const title = document.getElementById('camera-title');
        const originalTitle = title.innerText;
        title.innerText = "Loading Face Recognition Models...";
        
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models')
        ]);
        
        faceModelsLoaded = true;
        title.innerText = originalTitle;
    } catch (err) {
        console.error("Failed to load models:", err);
        alert("Face Recognition Error: Models failed to load. Check internet.");
    }
}

async function startAttendanceCamera(type) {
    attendanceType = type;
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-stream');
    const title = document.getElementById('camera-title');

    // Check if user has registered face data
    if (!window.userFaceDescriptor) {
        alert("WARNING: No face data found! Please Register again with a photo to use Face Recognition.");
        // Pwede mong i-block dito: return; 
        // Pero sa ngayon, hayaan natin magbukas pero magwa-warning.
    }

    title.innerText = type === 'in' ? "TIME IN - Take Photo" : "TIME OUT - Take Photo";

    try {
        modal.style.display = 'flex';
        
        // Load Models in background
        loadAttendanceModels();
        
        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user" }, 
            audio: false 
        });
        video.srcObject = cameraStream;
    } catch (err) {
        console.error("Camera Error:", err);
        
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'https:') {
            alert("CAMERA ERROR: Security Blocked!\n\nBrowsers block camera access on 'Not Secure' (HTTP) connections unless you are on localhost.\n\nSOLUTION:\n1. Use 'localhost' if on the same PC.\n2. Or go to 'chrome://flags', enable 'Insecure origins treated as secure', and add this IP address.");
        } else {
            alert("Could not access camera. Please allow camera permissions in your browser settings.");
        }
        closeCameraModal();
    }
}

function closeCameraModal() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-stream');

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    video.srcObject = null;
    modal.style.display = 'none';
}

async function captureAndSubmit() {
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('camera-canvas');
    const form = document.getElementById('attendance-form');

    if (!video.srcObject) return;

    // --- FACE RECOGNITION CHECK ---
    if (window.userFaceDescriptor) {
        if (!faceModelsLoaded) {
            alert("Please wait for face models to load...");
            return;
        }

        // Detect Face
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            alert("❌ No face detected! Please ensure your face is clearly visible.");
            return;
        }

        // Compare Faces (Euclidean Distance)
        // Mas mababa ang distance, mas match. (Threshold usually 0.6)
        const distance = faceapi.euclideanDistance(window.userFaceDescriptor, detection.descriptor);
        
        console.log("Face Match Distance:", distance);

        if (distance > 0.55) { // 0.55 is a strict threshold. 0.6 is standard.
            alert("❌ FACE MISMATCH!\n\nThis face does not match the registered account owner.\nAttendance DENIED.");
            return; // STOP SUBMISSION
        } else {
            // Match! Show success feedback briefly
            // alert("✅ Face Verified!"); // Optional: tanggalin kung gusto ng seamless
        }
    } else {
        // Optional: Kung gusto mong bawal talaga kapag walang data
        alert("⚠️ Warning: Bypassing Face ID (No registered data).");
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw image
    const ctx = canvas.getContext('2d');
    // Flip horizontally to match the mirrored video preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and submit
    canvas.toBlob(blob => {
        const formData = new FormData(form);
        formData.append('dtr_image', blob, `attendance-${attendanceType}-${Date.now()}.png`);

        const endpoint = attendanceType === 'in' ? '/time-in' : '/time-out';

        fetch(endpoint, { method: 'POST', body: formData })
            .then(async response => {
                const data = await response.json();
                // Kung may error sa server (hal. duplicate), i-throw para mahuli sa catch
                if (!response.ok || data.success === false) {
                    throw new Error(data.message || 'Server Error');
                }
                return data;
            })
            .then(data => {
                // Ipakita ang message (Success or Error)
                alert(data.message);
                
                // I-redirect sa tamang tab (Attendance Section) para hindi mapunta sa Menu
                if (data.redirectUrl) {
                    window.location.href = data.redirectUrl;
                } else {
                    window.location.reload();
                }
            })
            .catch(err => {
                console.error("Submission error:", err);
                alert("Attendance Error: " + err.message);
            });
    }, 'image/png');
}

// ==========================================
// INITIALIZATION ON PAGE LOAD
// ==========================================
document.addEventListener("DOMContentLoaded", function() {

    // --- SIDEBAR LOGIC (for userpage/adminpage) ---
    const sidebar = document.querySelector(".sidebar");
    const body = document.querySelector("body");
    const toggle = document.querySelector(".toggle");
    const hamburger = document.querySelector(".hamburger-toggle");

    if (sidebar) {
        // Siguraduhing 'close' ang default sa mobile para nakatago ang sidebar
        if (window.innerWidth <= 1024) {
            sidebar.classList.add("close");
        }

        let sidebarTimer;

        // Helper function para sa pag-toggle
        const toggleSidebar = () => {
            sidebar.classList.toggle("close");
            updateGrid();
            clearTimeout(sidebarTimer);
            if (!sidebar.classList.contains("close")) {
                sidebarTimer = setTimeout(() => {
                    sidebar.classList.add("close");
                    updateGrid();
                }, 3000);
            }
        };

        // Makinig sa desktop arrow toggle
        if (toggle) toggle.addEventListener("click", toggleSidebar);

        // Makinig sa mobile hamburger toggle
        if (hamburger) hamburger.addEventListener("click", toggleSidebar);


        // Ang updateGrid ay tinatawag na sa global scope, 
        // kaya tinanggal natin ang redundant definition dito sa loob.
    }

    // --- FACE DATA LOADING (User Page Only) ---
    const userPageContent = document.getElementById('userFaceDescriptorData');
    if (userPageContent) { 
        if (userPageContent.value) {
            try {
                const parsedData = JSON.parse(userPageContent.value);
                window.userFaceDescriptor = new Float32Array(parsedData);
                console.log("Face Data Loaded via Hidden Input.");
            } catch (e) {
                console.error("Error parsing face data:", e);
                window.userFaceDescriptor = null;
            }
        } else {
            window.userFaceDescriptor = null;
            console.log("No Face Data found for this user.");
        }
    }

    // --- ATTENDANCE STATUS LOADING ---
    const dutyStatusInput = document.getElementById('isOnDutyStatus');
    if (dutyStatusInput) {
        window.isOnDuty = dutyStatusInput.value === 'true';
        console.log("Duty Status Loaded:", window.isOnDuty);
    }

    // --- GLOBAL TAB INITIALIZATION (Admin & User Page) ---
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const sub = urlParams.get('sub');
    const currentPath = window.location.pathname;

    if (tab) {
        // Kung may 'tab' sa URL (e.g. ?tab=inventory), buksan iyon
        openSection(tab);
    } else {
        // Default behavior base sa kasalukuyang page
        if (currentPath.includes('/adminpage')) {
            openSection('analytics'); // Admin page defaults to analytics
        } else if (currentPath.includes('/userpage')) {
            openSection('menu');      // User page defaults to menu
        }
    }

    // Handle Attendance sub-section redirection
    if (sub === 'Attendance') {
        toggleForm('Attendance');
    }
    // Menu is hidden by default via CSS. filterMenu() must be called via button click.
});