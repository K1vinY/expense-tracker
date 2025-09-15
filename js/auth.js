// 身份驗證相關功能
class AuthManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
    }
    
    async login() {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        
        if (!email || !password) {
            alert('Please enter both email and password');
            return;
        }
        
        try {
            await this.auth.signInWithEmailAndPassword(email, password);
            console.log('Login successful');
        } catch (error) {
            console.error('Login error:', error);
            if (error.code === 'auth/user-not-found') {
                alert('No account found with this email address');
            } else if (error.code === 'auth/wrong-password') {
                alert('Incorrect password');
            } else if (error.code === 'auth/invalid-email') {
                alert('Invalid email address');
            } else {
                alert('Login failed: ' + error.message);
            }
        }
    }
    
    async register() {
        const email = document.getElementById('regEmail').value;
        const name = document.getElementById('regName').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        
        if (!email || !name || !password || !confirmPassword) {
            alert('Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }
        
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // 更新用戶的顯示名稱
            await user.updateProfile({
                displayName: name
            });
            
            // 創建用戶資料文檔
            await this.db.collection('users').doc(user.uid).set({
                email: email,
                displayName: name,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
            }, { merge: true });
            
            // 檢查是否有待處理的邀請
            await this.checkPendingInvitations(user.uid, email);
            
            console.log('Registration successful');
            this.app.showUserInfo();
            alert('Account created successfully!');
            
        } catch (error) {
            console.error('Registration error:', error);
            if (error.code === 'auth/email-already-in-use') {
                alert('An account with this email already exists');
            } else if (error.code === 'auth/weak-password') {
                alert('Password is too weak');
            } else if (error.code === 'auth/invalid-email') {
                alert('Invalid email address');
            } else {
                alert('Registration failed: ' + error.message);
            }
        }
    }
    
    async logout() {
        try {
            await this.auth.signOut();
            console.log('Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            alert('Logout failed: ' + error.message);
        }
    }
    
    async ensureUserDocument(user) {
        try {
            // 檢查用戶文檔是否存在
            const userDoc = await this.db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                // 如果文檔不存在，創建它
                await this.db.collection('users').doc(user.uid).set({
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    createdAt: new Date().toISOString(),
                    lastLoginAt: new Date().toISOString()
                });
                console.log('User document created for:', user.email);
            } else {
                // 如果文檔存在，更新 lastLoginAt
                await this.db.collection('users').doc(user.uid).update({
                    lastLoginAt: new Date().toISOString()
                });
                console.log('User document updated for:', user.email);
            }
        } catch (error) {
            console.error('Error ensuring user document:', error);
            // 不阻止登入流程，只是記錄錯誤
        }
    }
    
    loadUserSettings() {
        const currentUser = this.app.currentUser;
        if (!currentUser) return;
        
        document.getElementById('settingsEmail').value = currentUser.email;
        document.getElementById('settingsName').value = currentUser.displayName || currentUser.email.split('@')[0];
    }
    
    async updateUserSettings() {
        const currentUser = this.app.currentUser;
        if (!currentUser) return;
        
        const newName = document.getElementById('settingsName').value;
        if (!newName) {
            alert('Please enter a display name');
            return;
        }
        
        try {
            // 更新顯示名稱
            if (newName !== currentUser.displayName) {
                await currentUser.updateProfile({
                    displayName: newName
                });
                
                // 更新 Firestore 中的用戶資料
                await this.db.collection('users').doc(currentUser.uid).set({
                    email: currentUser.email,
                    displayName: newName,
                    createdAt: new Date().toISOString(),
                    lastLoginAt: new Date().toISOString()
                }, { merge: true });
                
                console.log('Display name updated');
            }
            
            // 更新本地顯示
            this.app.showUserInfo();
            
            alert('Settings updated successfully!');
            
        } catch (error) {
            console.error('Error updating settings:', error);
            alert('Failed to update settings: ' + error.message);
        }
    }
    
    async resetPassword() {
        const currentUser = this.app.currentUser;
        if (!currentUser) return;
        
        const currentPassword = document.getElementById('resetCurrentPassword').value;
        const newPassword = document.getElementById('resetNewPassword').value;
        const confirmPassword = document.getElementById('resetConfirmPassword').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            alert('Please fill in all password fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            alert('New password must be at least 6 characters');
            return;
        }
        
        try {
            const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
            await currentUser.reauthenticateWithCredential(credential);
            await currentUser.updatePassword(newPassword);
            console.log('Password updated');
            alert('Password updated successfully!');
            document.getElementById('resetCurrentPassword').value = '';
            document.getElementById('resetNewPassword').value = '';
            document.getElementById('resetConfirmPassword').value = '';
            this.app.showUserSettings(); // 回到設定頁面
        } catch (error) {
            console.error('Error updating password:', error);
            if (error.code === 'auth/wrong-password') {
                alert('Current password is incorrect');
            } else if (error.code === 'auth/weak-password') {
                alert('New password is too weak');
            } else {
                alert('Failed to update password: ' + error.message);
            }
        }
    }
    
    async checkPendingInvitations(userUid, userEmail) {
        try {
            const invitationsSnapshot = await this.db.collection('invitations')
                .where('invitedEmail', '==', userEmail)
                .where('status', '==', 'pending')
                .get();
            
            if (!invitationsSnapshot.empty) {
                const invitations = invitationsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                this.showInvitationsDialog(invitations, userUid);
            }
        } catch (error) {
            console.error('Error checking pending invitations:', error);
        }
    }
    
    showInvitationsDialog(invitations, userUid) {
        const invitationText = invitations.map(inv => 
            `• ${inv.groupName} (invited by ${inv.invitedByName})`
        ).join('\n');
        
        if (confirm(`You have ${invitations.length} pending group invitation(s):\n\n${invitationText}\n\nWould you like to accept all invitations?`)) {
            this.acceptAllInvitations(invitations, userUid);
        }
    }
    
    async acceptAllInvitations(invitations, userUid) {
        try {
            for (const invitation of invitations) {
                // 將用戶添加到群組
                await this.db.collection('groups').doc(invitation.groupId).update({
                    members: firebase.firestore.FieldValue.arrayUnion(userUid),
                    // 接受後從待加入清單移除該 email，避免同人重複（email + UID）
                    pendingMembers: firebase.firestore.FieldValue.arrayRemove(invitation.invitedEmail)
                });
                
                // 將群組內既有交易中的 pending email 轉換成該用戶 UID
                await this.migratePendingEmailToUid(invitation.groupId, invitation.invitedEmail, userUid);

                // 更新邀請狀態
                await this.db.collection('invitations').doc(invitation.id).update({
                    status: 'accepted',
                    acceptedAt: new Date().toISOString()
                });
            }
            
            alert(`Successfully joined ${invitations.length} group(s)!`);
            // 重新載入群組列表
            if (this.app && this.app.groupsManager) {
                this.app.groupsManager.loadGroups();
            }
        } catch (error) {
            console.error('Error accepting invitations:', error);
            alert('Failed to accept some invitations. Please try again.');
        }
    }

    // 將既有交易紀錄裡的 email（pending 成員）替換成剛加入的 UID，避免 balances/transactions 重複顯示
    async migratePendingEmailToUid(groupId, email, userUid) {
        try {
            const groupRef = this.db.collection('groups').doc(groupId);
            const groupSnap = await groupRef.get();
            if (!groupSnap.exists) return;

            const data = groupSnap.data();
            const expenses = Array.isArray(data.expenses) ? data.expenses : [];
            let changed = false;

            const migratedExpenses = expenses.map((exp) => {
                let updated = { ...exp };
                let modified = false;

                // paidBy 若為 email，轉為 UID
                if (updated.paidBy === email) {
                    updated.paidBy = userUid;
                    modified = true;
                }

                // splitBy 可能是 [id] 或 [{memberId, amount}]
                if (Array.isArray(updated.splitBy)) {
                    if (updated.splitBy.length > 0 && typeof updated.splitBy[0] === 'object') {
                        const newSplit = updated.splitBy.map(item => (
                            item.memberId === email ? { ...item, memberId: userUid } : item
                        ));
                        // 簡易差異檢查
                        if (JSON.stringify(newSplit) !== JSON.stringify(updated.splitBy)) {
                            updated.splitBy = newSplit;
                            modified = true;
                        }
                    } else {
                        const newSplit = updated.splitBy.map(id => id === email ? userUid : id);
                        if (JSON.stringify(newSplit) !== JSON.stringify(updated.splitBy)) {
                            updated.splitBy = newSplit;
                            modified = true;
                        }
                    }
                }

                if (modified) changed = true;
                return updated;
            });

            if (changed) {
                await groupRef.update({ expenses: migratedExpenses });
            }
        } catch (error) {
            console.error('migratePendingEmailToUid error:', error);
        }
    }

    // 一次性修復：以群組名稱尋找群組，將該群組交易中的 email 轉為 UID，並從 pendingMembers 移除
    async migrateGroupByName(groupName) {
        try {
            if (!this.app.currentUser) {
                alert('Please login first.');
                return;
            }
            const groupsSnap = await this.db.collection('groups')
                .where('name', '==', groupName)
                .get();
            if (groupsSnap.empty) {
                alert(`Group not found: ${groupName}`);
                return;
            }
            // 若同名多個群組，全部遷移
            for (const doc of groupsSnap.docs) {
                const groupId = doc.id;
                const data = doc.data();
                const pendingEmails = Array.isArray(data.pendingMembers) ? data.pendingMembers : [];

                // 建立 email -> uid 對照（僅對已存在的使用者）
                const emailToUid = {};
                for (const email of pendingEmails) {
                    const uSnap = await this.db.collection('users').where('email', '==', email).limit(1).get();
                    if (!uSnap.empty) {
                        emailToUid[email] = uSnap.docs[0].id;
                    }
                }

                let changed = false;
                let expenses = Array.isArray(data.expenses) ? data.expenses : [];
                const migratedExpenses = expenses.map(exp => {
                    let updated = { ...exp };
                    let modified = false;

                    if (emailToUid[updated.paidBy]) {
                        updated.paidBy = emailToUid[updated.paidBy];
                        modified = true;
                    }
                    if (Array.isArray(updated.splitBy)) {
                        if (updated.splitBy.length > 0 && typeof updated.splitBy[0] === 'object') {
                            const newSplit = updated.splitBy.map(item => (
                                emailToUid[item.memberId] ? { ...item, memberId: emailToUid[item.memberId] } : item
                            ));
                            if (JSON.stringify(newSplit) !== JSON.stringify(updated.splitBy)) {
                                updated.splitBy = newSplit;
                                modified = true;
                            }
                        } else {
                            const newSplit = updated.splitBy.map(id => emailToUid[id] ? emailToUid[id] : id);
                            if (JSON.stringify(newSplit) !== JSON.stringify(updated.splitBy)) {
                                updated.splitBy = newSplit;
                                modified = true;
                            }
                        }
                    }

                    if (modified) changed = true;
                    return updated;
                });

                // 從 pendingMembers 移除已找到對應 UID 的 email
                const remainingPending = pendingEmails.filter(email => !emailToUid[email]);

                if (changed || remainingPending.length !== pendingEmails.length) {
                    await this.db.collection('groups').doc(groupId).update({
                        expenses: migratedExpenses,
                        pendingMembers: remainingPending
                    });
                }
            }
            alert('Group migration completed. Please reopen the group.');
            if (this.app && this.app.groupsManager) {
                this.app.groupsManager.loadGroups();
            }
        } catch (e) {
            console.error('migrateGroupByName error:', e);
            alert('Migration failed: ' + e.message);
        }
    }
}
