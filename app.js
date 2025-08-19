// Initialize the database
let db;
const DB_NAME = 'InventoryDB';
const DB_VERSION = 1;

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupTabs();
    initDatabase();
    loadInventory();
    calculateDashboard();
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
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
        showStatus('Error loading database.', 'is-danger');
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
        showStatus('App is ready!', 'is-success', 2000);
    };
}

function saveTransaction() {
    const type = document.getElementById('type').value;
    const productId = document.getElementById('productId').value.trim();
    const productName = document.getElementById('productName').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);

    if (!productId || !productName || !quantity || !price) {
        showStatus('Please fill all fields.', 'is-danger');
        return;
    }

    const transaction = {
        type: type,
        productId: productId,
        productName: productName,
        quantity: quantity,
        price: price,
        date: new Date().toISOString()
    };

    const transaction = db.transaction(['transactions', 'products'], 'readwrite');
    
    // Save the transaction
    transaction.objectStore('transactions').add(transaction);
    
    // Update or create the product in inventory
    const productRequest = transaction.objectStore('products').get(productId);
    
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
        product.averagePrice = product.totalPurchased > 0 ? (product.totalCost / product.totalPurchased) : 0;
        
        // Update the product
        transaction.objectStore('products').put(product);
    };

    transaction.oncomplete = () => {
        showStatus('Transaction saved successfully!', 'is-success');
        clearForm();
        loadInventory();
        calculateDashboard();
    };

    transaction.onerror = () => {
        showStatus('Error saving transaction.', 'is-danger');
    };
}

function loadInventory() {
    const transaction = db.transaction('products', 'readonly');
    const request = transaction.objectStore('products').getAll();

    request.onsuccess = (event) => {
        const products = event.target.result;
        const tbody = document.querySelector('#inventoryTable tbody');
        tbody.innerHTML = '';

        products.forEach(product => {
            const currentStock = product.totalPurchased - product.totalSold;
            const row = `<tr>
                <td>${product.productId}</td>
                <td>${product.name}</td>
                <td class="${currentStock <= 5 ? 'has-text-danger has-text-weight-bold' : ''}">${currentStock}</td>
                <td>$${product.averagePrice.toFixed(2)}</td>
                <td>$${(currentStock * product.averagePrice).toFixed(2)}</td>
            </tr>`;
            tbody.innerHTML += row;
        });
    };
}

function calculateDashboard() {
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
                inventoryValue += (stock * p.averagePrice);
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