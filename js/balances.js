// 餘額計算相關功能
class BalancesManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
        this.groups = app.groups;
        this.isLocalMode = app.isLocalMode;
    }
    
    async showGroupBalances(groupId) {
        this.app.currentGroupId = groupId;
        console.log('showGroupBalances called with groupId:', groupId);
        console.log('Available groups from app:', this.app.groups);
        
        // 使用 app.groups 而不是 this.groups
        const group = this.app.groups.find(g => g.id === groupId);
        
        if (!group) {
            console.error('Group not found:', groupId);
            return;
        }
        
        console.log('Showing group balances for:', group.name);
        
        document.getElementById('balancesGroupTitle').textContent = `${group.name} - Balances`;
        document.querySelector('.group-balances-section').style.display = 'block';
        document.querySelector('.groups-section').style.display = 'none';
        document.querySelector('.group-detail-section').style.display = 'none';
        document.querySelector('.group-members-section').style.display = 'none';
        document.querySelector('.group-settings-section').style.display = 'none';
        
        await this.renderBalances();
    }
    
    async renderBalances() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        const balances = await this.calculateMemberBalances(group);
        const list = document.getElementById('balancesList');
        const summary = document.getElementById('balancesSummary');
        const settlementContainer = document.getElementById('settlementContainer');
        
        // 檢查是否所有人都結清了
        const allSettled = balances.every(balance => Math.abs(balance.balance) < 0.01);
        
        if (allSettled) {
            summary.textContent = 'All settled up! ✓';
            summary.className = 'balances-summary settled';
            settlementContainer.style.display = 'none';
        } else {
            summary.textContent = 'Some balances need to be settled';
            summary.className = 'balances-summary pending';
            settlementContainer.style.display = 'block';
            this.renderSettlementSuggestions(balances);
        }
        
        list.innerHTML = balances.map(balance => this.createBalanceItem(balance)).join('');
    }
    
    async calculateMemberBalances(group) {
        const memberBalances = {};
        
        // 初始化所有成員的餘額為 0
        if (this.isLocalMode) {
            // 本地模式：members 是物件陣列
            group.members.forEach(member => {
                memberBalances[member.id] = {
                    id: member.id,
                    name: member.name,
                    balance: 0
                };
            });
        } else {
            // Firebase 模式：members 是 UID 陣列，需要獲取用戶數據
            const memberData = await this.getMemberData(group.members);
            group.members.forEach(memberUid => {
                const memberInfo = memberData.find(m => m.id === memberUid);
                memberBalances[memberUid] = {
                    id: memberUid,
                    name: memberInfo ? memberInfo.name : 'Unknown User',
                    balance: 0
                };
            });
        }
        
        // 計算每筆交易對餘額的影響
        group.expenses.forEach(expense => {
            // 檢查是否為新的自訂金額格式
            if (expense.splitBy && expense.splitBy.length > 0 && typeof expense.splitBy[0] === 'object') {
                // 自訂金額模式
                expense.splitBy.forEach(splitItem => {
                    if (memberBalances[splitItem.memberId]) {
                        memberBalances[splitItem.memberId].balance -= splitItem.amount;
                    }
                });
            } else {
                // 平分模式（向後兼容）
                const splitAmount = expense.amount / expense.splitBy.length;
                expense.splitBy.forEach(memberId => {
                    if (memberBalances[memberId]) {
                        memberBalances[memberId].balance -= splitAmount;
                    }
                });
            }
            
            // 付錢的人收到錢
            if (memberBalances[expense.paidBy]) {
                memberBalances[expense.paidBy].balance += expense.amount;
            }
        });
        
        // 轉換為陣列並排序（欠錢的在前，被欠錢的在後）
        return Object.values(memberBalances).sort((a, b) => a.balance - b.balance);
    }
    
    async getMemberData(memberUids) {
        if (this.isLocalMode) return memberUids;
        
        const currentUser = this.app.currentUser;
        if (!currentUser) {
            console.error('No current user found in balances manager');
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
                name: uid.substring(0, 8) + '...',
                role: 'member',
                joinedAt: new Date().toISOString()
            }));
        }
    }
    
    createBalanceItem(balance) {
        const isOwed = balance.balance > 0.01;
        const isOwing = balance.balance < -0.01;
        const isSettled = Math.abs(balance.balance) < 0.01;
        
        let balanceClass = 'settled';
        let balanceText = '$0 ✓';
        let balanceBar = '';
        
        if (isOwed) {
            balanceClass = 'owed';
            balanceText = `+$${balance.balance.toFixed(2)}`;
            // 修復條形圖寬度計算，使用更合理的比例
            const maxAmount = 500; // 設定最大金額為500，超過這個數值就顯示100%寬度
            const barWidth = Math.min(Math.abs(balance.balance) / maxAmount, 1) * 100;
            balanceBar = `<div class="balance-bar owed" style="width: ${barWidth}%"></div>`;
        } else if (isOwing) {
            balanceClass = 'owing';
            balanceText = `-$${Math.abs(balance.balance).toFixed(2)}`;
            // 修復條形圖寬度計算，使用更合理的比例
            const maxAmount = 500; // 設定最大金額為500，超過這個數值就顯示100%寬度
            const barWidth = Math.min(Math.abs(balance.balance) / maxAmount, 1) * 100;
            balanceBar = `<div class="balance-bar owing" style="width: ${barWidth}%"></div>`;
        }
        
        return `
            <div class="balance-item">
                <div class="member-avatar">👤</div>
                <div class="member-name">${balance.name}</div>
                <div class="balance-display">
                    ${balanceBar}
                    <div class="balance-amount ${balanceClass}">${balanceText}</div>
                </div>
            </div>
        `;
    }
    
    renderSettlementSuggestions(balances) {
        const suggestions = this.generateSettlementSuggestions(balances);
        const container = document.getElementById('settlementSuggestions');
        
        if (suggestions.length === 0) {
            container.innerHTML = '<div class="no-suggestions">No settlement needed!</div>';
            return;
        }
        
        container.innerHTML = suggestions.map(suggestion => `
            <div class="settlement-suggestion">
                <div class="suggestion-text">${suggestion.text}</div>
                <div class="suggestion-amount">${suggestion.amount}</div>
            </div>
        `).join('');
    }
    
    generateSettlementSuggestions(balances) {
        // 創建餘額的深拷貝以避免修改原始數據
        const balancesCopy = balances.map(b => ({ ...b }));
        const suggestions = [];
        
        // 簡化結算建議：讓欠錢最多的人直接付給被欠錢最多的人
        while (balancesCopy.length > 1) {
            // 找到欠錢最多的人（最負的餘額）
            const debtor = balancesCopy.reduce((min, balance) => 
                balance.balance < min.balance ? balance : min
            );
            
            // 找到被欠錢最多的人（最正的餘額）
            const creditor = balancesCopy.reduce((max, balance) => 
                balance.balance > max.balance ? balance : max
            );
            
            // 如果所有人都結清了，退出循環
            if (Math.abs(debtor.balance) < 0.01 && Math.abs(creditor.balance) < 0.01) {
                break;
            }
            
            // 計算轉帳金額
            const transferAmount = Math.min(Math.abs(debtor.balance), creditor.balance);
            
            if (transferAmount > 0.01) {
                suggestions.push({
                    text: `${debtor.name} should pay ${creditor.name}`,
                    amount: `$${transferAmount.toFixed(2)}`
                });
                
                // 更新餘額
                debtor.balance += transferAmount;
                creditor.balance -= transferAmount;
            } else {
                break;
            }
        }
        
        return suggestions;
    }
}
