// 群組管理相關功能
class GroupsManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
        this.groups = app.groups;
        this.isLocalMode = app.isLocalMode;
    }
    
    async loadGroups() {
        console.log('loadGroups called, isLocalMode:', this.isLocalMode);
        console.log('currentUser from app:', this.app.currentUser);
        console.log('db:', this.db);
        
        // 使用 app.currentUser 而不是 this.currentUser
        const currentUser = this.app.currentUser;
        
        if (this.isLocalMode) {
            // 本地模式
            console.log('Loading groups from localStorage');
            this.groups = JSON.parse(localStorage.getItem('groups')) || [];
            this.app.groups = this.groups; // 同步到主應用程式
            this.renderGroups();
            this.updateTotalBalance();
        } else {
            // Firebase 模式
            try {
                if (!this.db) {
                    throw new Error('Firebase not initialized');
                }
                if (!currentUser) {
                    console.log('No user logged in, cannot load groups');
                    this.groups = [];
                    this.app.groups = this.groups; // 同步到主應用程式
                    this.renderGroups();
                    return;
                }
                
                console.log('Loading groups from Firebase for user:', currentUser.uid);
                
                // 先測試基本查詢
                console.log('Testing basic query...');
                const testSnapshot = await this.db.collection('groups').limit(5).get();
                console.log('Basic query result:', testSnapshot.docs.length, 'documents');
                
                // 再嘗試用戶特定查詢
                console.log('Testing user-specific query...');
                const snapshot = await this.db.collection('groups')
                    .where('members', 'array-contains', currentUser.uid)
                    .get();
                
                console.log('User-specific query result:', snapshot.docs.length, 'documents');
                console.log('Query docs:', snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
                
                this.groups = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this.app.groups = this.groups; // 同步到主應用程式
                console.log('Loaded groups from Firebase:', this.groups);
                this.renderGroups();
                this.updateTotalBalance();
            } catch (error) {
                console.error('Error loading groups:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                console.log('Firebase error, showing empty groups');
                this.groups = [];
                this.app.groups = this.groups; // 同步到主應用程式
                this.renderGroups();
                this.updateTotalBalance();
                
                // 顯示詳細錯誤信息給用戶
                let errorMessage = 'Failed to load groups. ';
                if (error.code === 'permission-denied') {
                    errorMessage += 'Permission denied. Please check Firestore security rules.';
                } else if (error.code === 'unavailable') {
                    errorMessage += 'Firebase service is unavailable. Please check your internet connection.';
                } else if (error.code === 'not-found') {
                    errorMessage += 'Firestore database not found. Please check your Firebase configuration.';
                } else {
                    errorMessage += `Error: ${error.message}`;
                }
                
                alert(errorMessage);
            }
        }
    }
    
    async addGroup() {
        const currentUser = this.app.currentUser;
        
        if (!this.isLocalMode && !currentUser) {
            alert('Please login to create a group');
            return;
        }
        
        const groupName = prompt('Enter group name:');
        if (!groupName) return;
        
        // 創建群組後直接進入成員管理頁面
        const group = {
            id: Date.now().toString(),
            name: groupName,
            expenses: [],
            members: this.isLocalMode ? [
                {
                    id: Date.now().toString(),
                    name: 'You',
                    role: 'admin',
                    joinedAt: new Date().toISOString()
                }
            ] : [{
                id: currentUser.uid,
                name: currentUser.displayName || currentUser.email.split('@')[0],
                role: 'admin',
                joinedAt: new Date().toISOString()
            }], // Firebase 模式也儲存完整用戶資料
            createdAt: new Date().toISOString(),
            createdBy: this.isLocalMode ? 'local' : currentUser.uid
        };
        
        console.log('Creating group with members:', group.members);
        console.log('Current user UID:', currentUser.uid);
        
        if (this.isLocalMode) {
            // 本地模式
            this.app.groups.unshift(group);
            this.saveGroups();
            this.renderGroups();
        } else {
            // Firebase 模式
            try {
                if (!this.db) {
                    throw new Error('Firebase not initialized');
                }
                
                console.log('Creating group in Firebase:', group);
                console.log('Firebase db object:', this.db);
                console.log('Firebase app:', firebase.app());
                
                await this.db.collection('groups').doc(group.id).set(group);
                console.log('Group created successfully in Firebase');
                
                this.app.groups.unshift(group);
                this.renderGroups();
            } catch (error) {
                console.error('Error creating group:', error);
                console.error('Error details:', error.message);
                console.error('Error code:', error.code);
                
                // 如果 Firebase 失敗，切換到本地模式
                if (error.message === 'Firebase not initialized') {
                    console.log('Firebase not available, switching to local mode');
                    this.isLocalMode = true;
                    this.app.groups.unshift(group);
                    this.saveGroups();
                    this.renderGroups();
                } else {
                    // 顯示更詳細的錯誤信息
                    let errorMessage = 'Failed to create group. ';
                    if (error.code === 'permission-denied') {
                        errorMessage += 'Permission denied. Please check Firestore security rules.';
                    } else if (error.code === 'unavailable') {
                        errorMessage += 'Firebase service is unavailable. Please check your internet connection.';
                    } else if (error.code === 'not-found') {
                        errorMessage += 'Firestore database not found. Please check your Firebase configuration.';
                    } else {
                        errorMessage += `Error: ${error.message}`;
                    }
                    
                    alert(errorMessage);
                    return;
                }
            }
        }
        
        // 直接進入成員管理頁面
        this.showGroupMembers(group.id);
    }
    
    renderGroups() {
        console.log('renderGroups called, groups:', this.app.groups);
        const grid = document.getElementById('groupsGrid');
        if (!grid) {
            console.error('groupsGrid element not found');
            return;
        }
        
        if (this.app.groups.length === 0) {
            console.log('No groups found, showing no-groups message');
            grid.innerHTML = '<div class="no-groups">No groups yet. Create your first group!</div>';
            return;
        }
        
        console.log('Rendering', this.app.groups.length, 'groups');
        grid.innerHTML = this.app.groups.map(group => this.createGroupCard(group)).join('');
    }
    
    createGroupCard(group) {
        // 計算總金額（只計算非 settlement 交易）
        const totalAmount = group.expenses
            .filter(expense => !expense.isSettlement)
            .reduce((sum, e) => sum + e.amount, 0);
        const memberCount = group.members ? group.members.length : 0;
        
        return `
            <div class="group-card" onclick="app.groupsManager.showGroupDetail('${group.id}')">
                <div class="group-icon">📁</div>
                <div class="group-name">${group.name}</div>
                <div class="group-balance">$${totalAmount.toFixed(2)}</div>
                <div class="group-transactions">${group.expenses.length} transactions</div>
                <div class="group-members">👥 ${memberCount} members</div>
            </div>
        `;
    }
    
    showGroupDetail(groupId) {
        this.app.currentGroupId = groupId;
        const group = this.app.groups.find(g => g.id === groupId);
        
        document.getElementById('groupTitle').textContent = 'Transactions';
        document.querySelector('.group-detail-section').style.display = 'block';
        document.querySelector('.groups-section').style.display = 'none';
        document.querySelector('.group-members-section').style.display = 'none';
        document.querySelector('.group-settings-section').style.display = 'none';
        document.querySelector('.group-balances-section').style.display = 'none';
        
        this.loadGroupExpenses();
        this.updateGroupBalance();
        this.setDefaultDateTime();
    }
    
    async loadGroupMembers() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const paidBySelect = document.getElementById('paidBy');
        const splitByContainer = document.getElementById('splitByContainer');
        
        // 清空現有選項
        if (paidBySelect) {
            paidBySelect.innerHTML = '<option value="">Select who paid</option>';
        }
        if (splitByContainer) {
            splitByContainer.innerHTML = '';
        }
        
        if (this.isLocalMode) {
            // 本地模式：members 是物件陣列
            group.members.forEach(member => {
                if (paidBySelect) {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = member.name;
                    paidBySelect.appendChild(option);
                }
            });
            this.renderSplitOptions(group.members);
        } else {
            // Firebase 模式：members 是 UID 陣列，需要轉換為完整物件
            const memberData = await this.getMemberData(group.members);
            
            // 更新群組的 members 陣列為完整物件
            group.members = memberData;
            
            memberData.forEach(member => {
                if (paidBySelect) {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = member.name;
                    paidBySelect.appendChild(option);
                }
            });
            this.renderSplitOptions(memberData);
        }
        
        // 綁定分錢模式切換事件
        this.bindSplitModeEvents();
    }
    
    showGroupsView() {
        document.querySelector('.group-detail-section').style.display = 'none';
        document.querySelector('.group-members-section').style.display = 'none';
        document.querySelector('.group-settings-section').style.display = 'none';
        document.querySelector('.group-balances-section').style.display = 'none';
        document.querySelector('.groups-section').style.display = 'block';
        this.app.currentGroupId = null;
        this.updateTotalBalance();
    }
    
    async loadGroupExpenses() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        // 載入成員數據到下拉選單
        await this.loadMembersForExpenseForm(group);
        
        // 渲染費用列表
        await this.renderExpenses(group.expenses);
    }
    
    async loadMembersForExpenseForm(group) {
        const paidBySelect = document.getElementById('paidBy');
        paidBySelect.innerHTML = '<option value="">Select who paid</option>';

        // 取得正式成員清單
        let activeMembers = [];
        if (this.isLocalMode) {
            activeMembers = group.members;
        } else {
            activeMembers = await this.getMemberData(group.members);
            // 更新群組的 members 陣列為完整物件
            group.members = activeMembers;
        }

        // 取得 pending 成員（以 email 表示）
        const pendingEmails = Array.isArray(group.pendingMembers) ? group.pendingMembers : [];
        const pendingMembers = pendingEmails.map(email => ({ id: email, name: email, role: 'pending' }));

        // 彙整所有可選成員
        const allMembers = [...activeMembers, ...pendingMembers];

        // 填充 Paid by 選單
        allMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.name;
            paidBySelect.appendChild(option);
        });

        // Split by 選項
        this.renderSplitOptions(allMembers);

        // 綁定分錢模式切換事件
        this.bindSplitModeEvents();
    }
    
    async getMemberData(memberUids) {
        if (this.isLocalMode) return memberUids;
        
        // 如果 memberUids 已經是完整物件，直接返回
        if (memberUids.length > 0 && typeof memberUids[0] === 'object' && memberUids[0].name) {
            return memberUids;
        }
        
        const currentUser = this.app.currentUser;
        if (!currentUser) {
            console.error('No current user found');
            return memberUids.map(uid => ({
                id: uid,
                name: uid.substring(0, 8) + '...',
                role: 'member',
                joinedAt: new Date().toISOString()
            }));
        }
        
        try {
            const memberPromises = memberUids.map(async (uid) => {
                if (uid === currentUser.uid) {
                    return {
                        id: uid,
                        name: currentUser.displayName || currentUser.email.split('@')[0],
                        role: 'admin',
                        joinedAt: new Date().toISOString()
                    };
                }
                
                try {
                    const userDoc = await this.db.collection('users').doc(uid).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        return {
                            id: uid,
                            name: userData.displayName || userData.email.split('@')[0],
                            role: 'member',
                            joinedAt: userData.createdAt || new Date().toISOString()
                        };
                    }
                } catch (error) {
                    console.error('Error fetching user data for UID:', uid, error);
                }
                
                // 如果無法獲取用戶資料，使用 UID 作為名稱
                return {
                    id: uid,
                    name: uid.substring(0, 8) + '...',
                    role: 'member',
                    joinedAt: new Date().toISOString()
                };
            });
            
            return await Promise.all(memberPromises);
        } catch (error) {
            console.error('Error getting member data:', error);
            return memberUids.map(uid => ({
                id: uid,
                name: uid === currentUser.uid ? (currentUser.displayName || currentUser.email.split('@')[0]) : uid.substring(0, 8) + '...',
                role: uid === currentUser.uid ? 'admin' : 'member',
                joinedAt: new Date().toISOString()
            }));
        }
    }
    
    renderSplitOptions(members) {
        const splitByContainer = document.getElementById('splitByContainer');
        const splitMode = document.querySelector('input[name="splitMode"]:checked').value;
        
        splitByContainer.innerHTML = '';
        
        members.forEach(member => {
            const splitItem = document.createElement('div');
            splitItem.className = 'split-item';
            
            if (splitMode === 'equal') {
                splitItem.innerHTML = `
                    <label class="split-label">
                        <input type="checkbox" class="split-checkbox" value="${member.id}" checked>
                        <span class="split-custom"></span>
                        ${member.name}
                    </label>
                `;
            } else {
                splitItem.innerHTML = `
                    <label class="split-label">
                        <input type="checkbox" class="split-checkbox" value="${member.id}" checked>
                        <span class="split-custom"></span>
                        ${member.name}
                    </label>
                    <input type="number" class="split-amount-input" data-member-id="${member.id}" 
                           placeholder="0.00" step="0.01" min="0" value="0">
                `;
            }
            
            splitByContainer.appendChild(splitItem);
        });
    }
    
    bindSplitModeEvents() {
        const splitModeRadios = document.querySelectorAll('input[name="splitMode"]');
        splitModeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
                if (group) {
                    if (this.isLocalMode) {
                        this.renderSplitOptions(group.members);
                    } else {
                        this.getMemberData(group.members).then(memberData => {
                            this.renderSplitOptions(memberData);
                        });
                    }
                }
            });
        });
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
        
        // 檢查是否為結算交易
        const isSettlement = expense.isSettlement;
        const settlementClass = isSettlement ? 'settlement-item' : '';
        const settlementIcon = isSettlement ? '💸' : '';
        
        // 調試信息
        console.log('Processing expense:', expense.description, 'isSettlement:', isSettlement);
        if (isSettlement) {
            console.log('Settlement transaction detected:', expense.description);
            console.log('Settlement class:', settlementClass);
        }
        
        return `
            <div class="expense-item ${settlementClass}">
                <div class="expense-info">
                    <div class="expense-description">
                        ${settlementIcon} ${expense.description}
                    </div>
                    <div class="expense-details">
                        <div class="expense-paid-by">💰 Paid by: ${paidByName}</div>
                        <div class="expense-split-by">👥 Split by: ${splitByText}</div>
                        <div class="expense-date">📅 ${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})}</div>
                    </div>
                </div>
                <div class="expense-amount ${isSettlement ? 'settlement-amount' : ''}">
                    $${expense.amount.toFixed(2)}
                </div>
                ${!isSettlement ? `
                    <button class="edit-btn pixel-icon" onclick="app.expensesManager.startEditExpense(${expense.timestamp})">✎</button>
                ` : ''}
                <button class="delete-btn" ${!isSettlement ? 'style="margin-left:8px"' : ''} onclick="app.expensesManager.deleteExpense(${expense.timestamp})">✖</button>
            </div>
        `;
    }
    
    async findMemberById(memberId) {
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return null;
        
        // 如果 memberId 是 email（pending 成員），直接回傳 email 當名稱
        if (memberId && memberId.includes && memberId.includes('@')) {
            return { id: memberId, name: memberId };
        }
        
        // 先檢查群組成員列表（現在包含完整的用戶資料）
        const groupMember = group.members.find(m => m.id === memberId);
        if (groupMember) {
            return groupMember;
        }
        
        // 檢查待處理成員列表
        const pendingMember = group.pendingMembers && group.pendingMembers.includes(memberId);
        if (pendingMember) {
            return { id: memberId, name: memberId };
        }
        
        // 如果都找不到，嘗試從 Firestore 查詢（用於已刪除的成員）
        if (!this.isLocalMode) {
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
                console.error('Error fetching user data for deleted member:', memberId, error);
            }
        }
        
        // 如果都找不到，回傳預設值
        return {
            id: memberId,
            name: memberId.substring(0, 8) + '...'
        };
    }
    
    updateGroupBalance() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        // 只計算非 settlement 交易的總金額
        const total = group.expenses
            .filter(expense => !expense.isSettlement)
            .reduce((sum, expense) => sum + expense.amount, 0);
        const balanceElement = document.getElementById('groupBalance');
        if (balanceElement) {
            balanceElement.textContent = `$${total.toFixed(2)}`;
        }
    }
    
    updateTotalBalance() {
        // 總餘額顯示已移除，此方法保留以保持兼容性
        return;
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
    
    updateGroupStats() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const totalAmount = group.expenses.reduce((sum, e) => sum + e.amount, 0);
        
        // 只更新群組餘額顯示
        const groupBalanceElement = document.getElementById('groupBalance');
        if (groupBalanceElement) {
            groupBalanceElement.textContent = `$${totalAmount.toFixed(2)}`;
        }
    }
    
    saveGroups() {
        if (this.isLocalMode) {
            localStorage.setItem('groups', JSON.stringify(this.app.groups));
        }
    }
    
    async updateGroupInfo() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        // 僅限群組擁有者（admin）可編輯群組資訊
        const currentUser = this.app.currentUser;
        if (!currentUser || !group || group.createdBy !== currentUser.uid) {
            alert('Only the group owner can update settings.');
            return;
        }
        const newName = document.getElementById('groupNameEdit').value;
        const description = document.getElementById('groupDescription').value;
        
        if (!newName) return;
        
        group.name = newName;
        group.description = description;
        
        if (this.isLocalMode) {
            this.saveGroups();
        } else {
            // Firebase 模式
            try {
                await this.db.collection('groups').doc(this.app.currentGroupId).update({
                    name: newName,
                    description: description
                });
            } catch (error) {
                console.error('Error updating group info:', error);
                alert('Failed to update group information. Please try again.');
                return;
            }
        }
        
        this.renderGroups();
        
        // 更新群組詳情頁面的標題
        document.getElementById('groupTitle').textContent = 'Transactions';
        
        alert('Group information updated successfully!');
    }
    
    async leaveGroup(groupId) {
        if (!groupId) return;
        
        const group = this.app.groups.find(g => g.id === groupId);
        if (!group) return;
        
        const groupName = group.name;
        
        if (!confirm(`Are you sure you want to leave the group "${groupName}"?`)) {
            return;
        }
        
        const currentUser = this.app.currentUser;
        if (!currentUser) return;
        
        // 移除當前用戶
        if (group.members.length > 1) {
            if (this.isLocalMode) {
                // 本地模式：移除第一個成員（假設是當前用戶）
                group.members = group.members.slice(1);
                this.saveGroups();
            } else {
                // Firebase 模式
                try {
                    await this.db.collection('groups').doc(groupId).update({
                        members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
                    });
                    
                    // 更新本地數據
                    group.members = group.members.filter(uid => uid !== currentUser.uid);
                } catch (error) {
                    console.error('Error leaving group:', error);
                    alert('Failed to leave group. Please try again.');
                    return;
                }
            }
            
            // 立即重新載入群組列表並回到首頁
            if (this.app && this.app.groupsManager && this.app.groupsManager.loadGroups) {
                await this.loadGroups();
            }
            this.app.currentGroupId = null;
            this.showGroupsView();
            alert('You have left the group!');
        } else {
            // 如果是最後一個成員，刪除整個群組
            this.deleteGroup(groupId);
        }
    }
    
    async deleteGroup(groupId) {
        if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
            return;
        }
        
        const group = this.app.groups.find(g => g.id === groupId);
        if (!group) return;
        
        if (this.isLocalMode) {
            this.app.groups = this.app.groups.filter(g => g.id !== groupId);
            this.saveGroups();
        } else {
            try {
                await this.db.collection('groups').doc(groupId).delete();
                this.app.groups = this.app.groups.filter(g => g.id !== groupId);
            } catch (error) {
                console.error('Error deleting group:', error);
                alert('Failed to delete group: ' + error.message);
                return;
            }
        }
        
        this.renderGroups();
        this.showGroupsView();
        alert('Group deleted successfully!');
    }
}
