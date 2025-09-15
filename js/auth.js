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
                    members: firebase.firestore.FieldValue.arrayUnion(userUid)
                });
                
                // 更新邀請狀態
                await this.db.collection('invitations').doc(invitation.id).update({
                    status: 'accepted',
                    acceptedAt: new Date().toISOString()
                });
            }
            
            alert(`Successfully joined ${invitations.length} group(s)!`);
            this.app.loadGroups(); // 重新載入群組列表
        } catch (error) {
            console.error('Error accepting invitations:', error);
            alert('Failed to accept some invitations. Please try again.');
        }
    }
}
