// 費用管理相關功能
class ExpensesManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
        this.groups = app.groups;
        this.isLocalMode = app.isLocalMode;
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
        
        if (this.isLocalMode) {
            // 本地模式
            const group = this.groups.find(g => g.id === this.app.currentGroupId);
            if (group) {
                group.expenses.push(expense);
                this.saveGroups();
                this.renderExpenses(group.expenses);
                this.updateGroupBalance();
                this.resetForm();
            }
        } else {
            // Firebase 模式
            try {
                const group = this.groups.find(g => g.id === this.app.currentGroupId);
                if (!group) return;
                
                // 更新群組的費用列表
                await this.db.collection('groups').doc(this.app.currentGroupId).update({
                    expenses: firebase.firestore.FieldValue.arrayUnion(expense)
                });
                
                // 更新本地數據
                group.expenses.push(expense);
                this.renderExpenses(group.expenses);
                this.updateGroupBalance();
                this.resetForm();
                
                console.log('Expense added successfully');
            } catch (error) {
                console.error('Error adding expense:', error);
                alert('Failed to add expense: ' + error.message);
            }
        }
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
        
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
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
        
        this.renderExpenses(group.expenses);
        this.updateGroupBalance();
    }
    
    clearAllExpenses() {
        if (!confirm('Are you sure you want to clear all expenses? This action cannot be undone.')) {
            return;
        }
        
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
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
        
        this.renderExpenses(group.expenses);
        this.updateGroupBalance();
    }
    
    renderExpenses(expenses) {
        const list = document.getElementById('expenseList');
        if (!list) return;
        
        if (expenses.length === 0) {
            list.innerHTML = '<div class="no-data">📝 No transactions yet</div>';
            return;
        }
        
        // 按日期排序（最新的在前）
        const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        list.innerHTML = sortedExpenses.map(expense => this.createExpenseItem(expense)).join('');
    }
    
    createExpenseItem(expense) {
        // Handle both Firestore timestamp and regular date
        const date = expense.date && expense.date.toDate ? 
            expense.date.toDate() : 
            new Date(expense.date || expense.timestamp);
        
        // 獲取付錢的人和分錢的人的名稱
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
        const paidByName = this.findMemberById(expense.paidBy)?.name || 'Unknown';
        
        let splitByText = '';
        if (expense.splitBy && expense.splitBy.length > 0 && typeof expense.splitBy[0] === 'object') {
            // 自訂金額模式
            splitByText = expense.splitBy.map(splitItem => {
                const memberName = this.findMemberById(splitItem.memberId)?.name || 'Unknown';
                return `${memberName} ($${splitItem.amount.toFixed(2)})`;
            }).join(', ');
        } else {
            // 平分模式
            splitByText = expense.splitBy.map(id => 
                this.findMemberById(id)?.name || 'Unknown'
            ).join(', ');
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
                <button class="delete-btn" onclick="app.expensesManager.deleteExpense(${expense.timestamp})">❌</button>
            </div>
        `;
    }
    
    findMemberById(memberId) {
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return null;
        
        if (this.isLocalMode) {
            return group.members.find(m => m.id === memberId);
        } else {
            // Firebase 模式下需要從用戶數據中查找
            // 這裡簡化處理，實際應該緩存用戶數據
            return { name: memberId.substring(0, 8) + '...' };
        }
    }
    
    updateGroupBalance() {
        if (!this.app.currentGroupId) return;
        
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
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
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
        if (group) {
            this.app.groupsManager.renderSplitOptions(group.members);
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
