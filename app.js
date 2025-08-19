// Initialize the database
let db;
const DB_NAME = 'InventoryDB';
const DB_VERSION = 1;

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('Initializing app...');
    setupTabs();
    initDatabase().then(() => {
        console.log('Database initialized');
        loadInventory();
        calculateDashboard();
        showStatus('App is ready!', 'is-success', 2000);
    }).catch(error => {
        console.error('Failed to initialize database:', error);
        showStatus('Failed to load app. Please refresh.', 'is-danger');
    });
    
    document.getElementById('saveBtn').addEventListener('click', saveTransaction);
    document.getElementById('refreshBtn').addEventListener('click', loadInventory);
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tabs li');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and content
            document.querySelectorAll('.tabs li').forEach(t => t.classList.remove('is-active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('is-hidden'));
            
            // Add active class to clicked tab and show its content
            tab.classList.add('is-active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.remove('is-hidden');
        });
    });
}

function initDatabase() {
    console.log('Initializing database...');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Create object store for transactions
            if (!db.objectStoreNames.contains('transactions')) {
                const transactionStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                transactionStore.createIndex('type', 'type', { unique: false });
                transactionStore.createIndex('date', 'date', { unique: false });
            }
            
            // Create object store for products (inventory)
            if (!db.objectStoreNames.contains('products')) {
                const productStore = db.createObjectStore('products', { keyPath: 'productId' });
                productStore.createIndex('name', 'name', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully');
            resolve(db);
        };
    });
}

function saveTransaction() {
    // Check if database is ready
    if (!db) {
        showStatus('Database is not ready yet. Please wait.', 'is-danger');
        return;
    }

    const type = document.getElementById('type').value;
    const productId = document.getElementById('productId').value.trim();
    const productName = document.getElementById('productName').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);

    if (!productId || !productName || !quantity || !price) {
        showStatus('Please fill all fields.', 'is-danger');
        return;
    }

    const transactionData = {
        type: type,
        productId: productId,
        productName: productName,
        quantity: quantity,
        price: price,
        date: new Date().toISOString()
    };

    try {
        const dbTransaction = db.transaction(['transactions', 'products'], 'readwrite');
        
        // Save the transaction
        dbTransaction.objectStore('transactions').add(transactionData);
        
        // Update or create the product in inventory
        const productStore = dbTransaction.objectStore('products');
        const productRequest = productStore.get(productId);
        
        productRequest.onsuccess = (event) => {
            const product = event.target.result || { 
                productId: productId, 
                name: productName, 
                totalPurchased: 0, 
                totalSold: 0, 
                totalCost: 0, 
                totalRevenue: 0 
            };
            
            if (type === 'Purchase') {
                product.totalPurchased += quantity;
                product.totalCost += (quantity * price);
            } else { // Sale
                product.totalSold += quantity;
                product.totalRevenue += (quantity * price);
            }
            
            // Recalculate average price
            product.averagePrice = product.totalPurchased > 0 ? 
                (product.totalCost / product.totalPurchased) : 0;
            
            // Update the product
            productStore.put(product);
        };

        dbTransaction.oncomplete = () => {
            showStatus('Transaction saved successfully!', 'is-success');
            clearForm();
            loadInventory();
            calculateDashboard();
        };

        dbTransaction.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
            showStatus('Error saving transaction: ' + event.target.error.message, 'is-danger');
        };
    } catch (error) {
        console.error('Error:', error);
        showStatus('Error: ' + error.message, 'is-danger');
    }
}

function loadInventory() {
    if (!db) {
        showStatus('Database not ready.', 'is-warning');
        return;
    }

    const transaction = db.transaction('products', 'readonly');
    const request = transaction.objectStore('products').getAll();

    request.onsuccess = (event) => {
        const products = event.target.result;
        const tbody = document.querySelector('#inventoryTable tbody');
        tbody.innerHTML = '';

        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="has-text-centered">No products found. Add a transaction first.</td></tr>';
            return;
        }

        products.forEach(product => {
            const currentStock = product.totalPurchased - product.totalSold;
            const row = `<tr>
                <td>${product.productId}</td>
                <td>${product.name}</td>
                <td class="${currentStock <= 5 ? 'has-text-danger has-text-weight-bold' : ''}">${currentStock}</td>
                <td>$${product.averagePrice ? product.averagePrice.toFixed(2) : '0.00'}</td>
                <td>$${(currentStock * (product.averagePrice || 0)).toFixed(2)}</td>
            </tr>`;
            tbody.innerHTML += row;
        });
    };

    request.onerror = () => {
        showStatus('Error loading inventory.', 'is-danger');
    };
}

function calculateDashboard() {
    if (!db) return;

    const transaction = db.transaction('transactions', 'readonly');
    const request = transaction.objectStore('transactions').getAll();

    request.onsuccess = (event) => {
        const transactions = event.target.result;
        let totalRevenue = 0;
        let totalCost = 0;

        transactions.forEach(t => {
            if (t.type === 'Sale') {
                totalRevenue += (t.quantity * t.price);
            } else {
                totalCost += (t.quantity * t.price);
            }
        });

        // Calculate inventory value from products
        const productTransaction = db.transaction('products', 'readonly');
        const productRequest = productTransaction.objectStore('products').getAll();

        productRequest.onsuccess = (e) => {
            const products = e.target.result;
            let inventoryValue = 0;

            products.forEach(p => {
                const stock = p.totalPurchased - p.totalSold;
                inventoryValue += (stock * (p.averagePrice || 0));
            });

            // Update the dashboard
            document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
            document.getElementById('totalCost').textContent = `$${totalCost.toFixed(2)}`;
            document.getElementById('netProfit').textContent = `$${(totalRevenue - totalCost).toFixed(2)}`;
            document.getElementById('inventoryValue').textContent = `$${inventoryValue.toFixed(2)}`;
        };
    };
}

function clearForm() {
    document.getElementById('productId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('quantity').value = '';
    document.getElementById('price').value = '';
}

function showStatus(message, type, duration = 3000) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `notification ${type}`;
    statusEl.classList.remove('is-hidden');

    if (duration) {
        setTimeout(() => {
            statusEl.classList.add('is-hidden');
        }, duration);
    }
}
