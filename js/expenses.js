// 費用管理相關功能
class ExpensesManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
        this.groups = app.groups;
        this.isLocalMode = app.isLocalMode;
        this.editingTimestamp = null;
        this.editingOriginal = null;
    }
    
    async addExpense() {
        if (!this.app.currentGroupId) {
            console.log('No current group ID');
            return;
        }
        
        const description = document.getElementById('description').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const paidBy = document.getElementById('paidBy').value;
        const splitBy = this.getSplitByData();
        const date = document.getElementById('transactionDate').value;
        
        if (!description || !amount || !paidBy || !splitBy || splitBy.length === 0) {
            alert('Please fill in all required fields');
            return;
        }
        
        if (amount <= 0) {
            alert('Amount must be greater than 0');
            return;
        }
        
        // 驗證自訂金額總和
        const splitMode = document.querySelector('input[name="splitMode"]:checked').value;
        if (splitMode === 'custom') {
            const totalSplitAmount = splitBy.reduce((sum, split) => sum + split.amount, 0);
            if (Math.abs(totalSplitAmount - amount) > 0.01) {
                alert('Total split amount must equal the expense amount');
                return;
            }
        }
        
        const expense = {
            id: Date.now().toString(),
            description: description,
            amount: amount,
            paidBy: paidBy,
            splitBy: splitBy,
            date: new Date(date).toISOString(),
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };
        
        console.log('New expense:', expense);
        
        const isEditing = !!this.editingTimestamp;

        if (this.isLocalMode) {
            // 本地模式
            const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
            if (group) {
                if (isEditing) {
                    const idx = group.expenses.findIndex(e => e.timestamp === this.editingTimestamp);
                    if (idx !== -1) {
                        // 保留原 timestamp 以利刪除/排序穩定
                        expense.timestamp = this.editingTimestamp;
                        group.expenses[idx] = expense;
                    }
                } else {
                    group.expenses.push(expense);
                }
                this.saveGroups();
                await this.renderExpenses(group.expenses);
                this.updateGroupBalance();
                await this.resetForm();
                this.finishEditMode();
            }
        } else {
            // Firebase 模式
            try {
                const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
                if (!group) return;
                
                if (isEditing) {
                    // 先移除舊的，再加入新的
                    const old = group.expenses.find(e => e.timestamp === this.editingTimestamp);
                    if (old) {
                        await this.db.collection('groups').doc(this.app.currentGroupId).update({
                            expenses: firebase.firestore.FieldValue.arrayRemove(old)
                        });
                    }
                    expense.timestamp = this.editingTimestamp;
                    await this.db.collection('groups').doc(this.app.currentGroupId).update({
                        expenses: firebase.firestore.FieldValue.arrayUnion(expense)
                    });
                    const idx = group.expenses.findIndex(e => e.timestamp === this.editingTimestamp);
                    if (idx !== -1) group.expenses[idx] = expense;
                } else {
                    await this.db.collection('groups').doc(this.app.currentGroupId).update({
                        expenses: firebase.firestore.FieldValue.arrayUnion(expense)
                    });
                    group.expenses.push(expense);
                }
                await this.renderExpenses(group.expenses);
                this.updateGroupBalance();
                await this.resetForm();
                
                console.log('Expense added successfully');
                this.finishEditMode();
            } catch (error) {
                console.error('Error adding expense:', error);
                alert('Failed to add expense: ' + error.message);
            }
        }
    }

    finishEditMode() {
        this.editingTimestamp = null;
        this.editingOriginal = null;
        const submitBtn = document.querySelector('#expenseForm button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Save';
        const cancelBtn = document.getElementById('cancelEdit');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    cancelEdit() {
        this.resetForm();
        this.finishEditMode();
    }
    
    getSplitByData() {
        const splitMode = document.querySelector('input[name="splitMode"]:checked').value;
        const checkedBoxes = document.querySelectorAll('.split-checkbox:checked');
        
        if (splitMode === 'equal') {
            // 平分模式
            return Array.from(checkedBoxes).map(checkbox => checkbox.value);
        } else {
            // 自訂金額模式
            const splitData = [];
            checkedBoxes.forEach(checkbox => {
                const memberId = checkbox.value;
                const amountInput = document.querySelector(`.split-amount-input[data-member-id="${memberId}"]`);
                const amount = parseFloat(amountInput.value) || 0;
                
                if (amount > 0) {
                    splitData.push({
                        memberId: memberId,
                        amount: amount
                    });
                }
            });
            return splitData;
        }
    }
    
    async deleteExpense(timestamp) {
        if (!confirm('Are you sure you want to delete this expense?')) {
            return;
        }
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const expenseToDelete = group.expenses.find(expense => expense.timestamp === parseInt(timestamp));
        if (!expenseToDelete) return;
        
        if (this.isLocalMode) {
            // 本地模式
            group.expenses = group.expenses.filter(expense => expense.timestamp !== parseInt(timestamp));
            this.saveGroups();
        } else {
            // Firebase 模式
            try {
                // 從 Firestore 中移除費用
                await this.db.collection('groups').doc(this.app.currentGroupId).update({
                    expenses: firebase.firestore.FieldValue.arrayRemove(expenseToDelete)
                });
                
                // 更新本地數據
                group.expenses = group.expenses.filter(expense => expense.timestamp !== parseInt(timestamp));
            } catch (error) {
                console.error('Error deleting expense:', error);
                alert('Failed to delete expense: ' + error.message);
                return;
            }
        }
        
        await this.renderExpenses(group.expenses);
        this.updateGroupBalance();
    }
    
    async clearAllExpenses() {
        if (!confirm('Are you sure you want to clear all expenses? This action cannot be undone.')) {
            return;
        }
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        if (this.isLocalMode) {
            // 本地模式
            group.expenses = [];
            this.saveGroups();
        } else {
            // Firebase 模式
            try {
                this.db.collection('groups').doc(this.app.currentGroupId).update({
                    expenses: []
                });
                group.expenses = [];
            } catch (error) {
                console.error('Error clearing expenses:', error);
                alert('Failed to clear expenses: ' + error.message);
                return;
            }
        }
        
        await this.renderExpenses(group.expenses);
        this.updateGroupBalance();
    }
    
    async renderExpenses(expenses) {
        const list = document.getElementById('expenseList');
        if (!list) return;
        
        if (expenses.length === 0) {
            list.innerHTML = '<div class="no-data">📝 No transactions yet</div>';
            return;
        }
        
        // 按日期排序（最新的在前）
        const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // 使用 Promise.all 來處理所有異步的 createExpenseItem 調用
        const expenseItems = await Promise.all(
            sortedExpenses.map(expense => this.createExpenseItem(expense))
        );
        
        list.innerHTML = expenseItems.join('');
    }
    
    async createExpenseItem(expense) {
        // Handle both Firestore timestamp and regular date
        const date = expense.date && expense.date.toDate ? 
            expense.date.toDate() : 
            new Date(expense.date || expense.timestamp);
        
        // 獲取付錢的人和分錢的人的名稱
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        const paidByMember = await this.findMemberById(expense.paidBy);
        const paidByName = paidByMember?.name || 'Unknown';
        
        let splitByText = '';
        if (expense.splitBy && expense.splitBy.length > 0 && typeof expense.splitBy[0] === 'object') {
            // 自訂金額模式
            const splitByPromises = expense.splitBy.map(async (splitItem) => {
                const member = await this.findMemberById(splitItem.memberId);
                const memberName = member?.name || 'Unknown';
                return `${memberName} ($${splitItem.amount.toFixed(2)})`;
            });
            const splitByResults = await Promise.all(splitByPromises);
            splitByText = splitByResults.join(', ');
        } else {
            // 平分模式
            const splitByPromises = expense.splitBy.map(async (id) => {
                const member = await this.findMemberById(id);
                return member?.name || 'Unknown';
            });
            const splitByResults = await Promise.all(splitByPromises);
            splitByText = splitByResults.join(', ');
        }
        
        return `
            <div class="expense-item">
                <div class="expense-info">
                    <div class="expense-description">${expense.description}</div>
                    <div class="expense-details">
                        <div class="expense-paid-by">💰 Paid by: ${paidByName}</div>
                        <div class="expense-split-by">👥 Split by: ${splitByText}</div>
                        <div class="expense-date">📅 ${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})}</div>
                    </div>
                </div>
                <div class="expense-amount">
                    $${expense.amount.toFixed(2)}
                </div>
                <button class="edit-btn pixel-icon" onclick="app.expensesManager.startEditExpense(${expense.timestamp})">✎</button>
                <button class="delete-btn" style="margin-left:8px" onclick="app.expensesManager.deleteExpense(${expense.timestamp})">✖</button>
            </div>
        `;
    }

    async startEditExpense(timestamp) {
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        const expense = group.expenses.find(e => e.timestamp === timestamp);
        if (!expense) return;
        this.editingTimestamp = timestamp;
        this.editingOriginal = { ...expense };

        // 基本欄位
        const descInput = document.getElementById('description');
        const amountInput = document.getElementById('amount');
        const paidBySelect = document.getElementById('paidBy');
        const dateInput = document.getElementById('transactionDate');
        if (descInput) descInput.value = expense.description || '';
        if (amountInput) amountInput.value = expense.amount;
        if (paidBySelect) paidBySelect.value = expense.paidBy;
        if (dateInput) {
            const d = expense.date && expense.date.toDate ? expense.date.toDate() : new Date(expense.date || expense.timestamp);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            const hh = String(d.getHours()).padStart(2,'0');
            const mi = String(d.getMinutes()).padStart(2,'0');
            dateInput.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
        }

        // 重新渲染分攤選項並套用值
        if (group) {
            // 取正式成員 + pending email，與 groups.js 的 loadMembersForExpenseForm 一致
            let activeMembers = [];
            if (this.isLocalMode) {
                activeMembers = group.members;
            } else {
                activeMembers = await this.app.groupsManager.getMemberData(group.members);
            }
            const pendingEmails = Array.isArray(group.pendingMembers) ? group.pendingMembers : [];
            const pendingMembers = pendingEmails.map(email => ({ id: email, name: email, role: 'pending' }));
            const allMembers = [...activeMembers, ...pendingMembers];
            this.app.groupsManager.renderSplitOptions(allMembers);
        }
        // 設定分攤模式
        const equalRadio = document.querySelector('input[name="splitMode"][value="equal"]');
        const customRadio = document.querySelector('input[name="splitMode"][value="custom"]');
        const splitContainer = document.getElementById('splitByContainer');
        if (expense.splitBy && expense.splitBy.length > 0 && typeof expense.splitBy[0] === 'object') {
            if (customRadio) customRadio.checked = true;
            if (splitContainer) {
                expense.splitBy.forEach(item => {
                    const cb = splitContainer.querySelector(`.split-checkbox[value="${item.memberId}"]`);
                    if (cb) cb.checked = true;
                    const amt = splitContainer.querySelector(`.split-amount-input[data-member-id="${item.memberId}"]`);
                    if (amt) amt.value = item.amount.toFixed(2);
                });
            }
        } else {
            if (equalRadio) equalRadio.checked = true;
            if (splitContainer) {
                (expense.splitBy || []).forEach(id => {
                    const cb = splitContainer.querySelector(`.split-checkbox[value="${id}"]`);
                    if (cb) cb.checked = true;
                });
            }
        }

        // 將提交按鈕文字改為 Update
        const submitBtn = document.querySelector('#expenseForm button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Update';
        const cancelBtn = document.getElementById('cancelEdit');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    }
    
    async findMemberById(memberId) {
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return null;
        
        if (this.isLocalMode) {
            return group.members.find(m => m.id === memberId);
        } else {
            // Firebase 模式下需要從用戶數據中查找
            const currentUser = this.app.currentUser;
            if (!currentUser) return { name: 'Unknown' };
            
            // 如果 memberId 是 email（pending 成員），直接回傳 email 當名稱
            if (memberId && memberId.includes && memberId.includes('@')) {
                return { id: memberId, name: memberId };
            }

            if (memberId === currentUser.uid) {
                return {
                    id: memberId,
                    name: currentUser.displayName || currentUser.email.split('@')[0]
                };
            }
            
            try {
                const userDoc = await this.db.collection('users').doc(memberId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    return {
                        id: memberId,
                        name: userData.displayName || userData.email.split('@')[0]
                    };
                }
            } catch (error) {
                console.error('Error fetching user data for UID:', memberId, error);
            }
            
            // 如果無法獲取用戶資料，使用 UID 作為名稱
            return {
                id: memberId,
                name: memberId.substring(0, 8) + '...'
            };
        }
    }
    
    updateGroupBalance() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const total = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const balanceElement = document.getElementById('groupBalance');
        if (balanceElement) {
            balanceElement.textContent = `$${total.toFixed(2)}`;
        }
    }
    
    resetForm() {
        document.getElementById('expenseForm').reset();
        this.setDefaultDateTime();
        
        // 重新渲染分錢選項
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (group) {
            if (this.isLocalMode) {
                this.app.groupsManager.renderSplitOptions(group.members);
            } else {
                // Firebase：載入正式成員 + pending email
                this.app.groupsManager.getMemberData(group.members).then(activeMembers => {
                    const pendingEmails = Array.isArray(group.pendingMembers) ? group.pendingMembers : [];
                    const pendingMembers = pendingEmails.map(email => ({ id: email, name: email, role: 'pending' }));
                    const allMembers = [...activeMembers, ...pendingMembers];
                    this.app.groupsManager.renderSplitOptions(allMembers);
                });
            }
        }
    }
    
    setDefaultDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
        const dateTimeInput = document.getElementById('transactionDate');
        if (dateTimeInput) {
            dateTimeInput.value = dateTimeString;
        }
    }
    
    saveGroups() {
        if (this.isLocalMode) {
            localStorage.setItem('groups', JSON.stringify(this.groups));
        }
    }
}
