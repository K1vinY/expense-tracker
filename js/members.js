// 成員管理相關功能
class MembersManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.auth = app.auth;
        this.currentUser = app.currentUser;
        this.groups = app.groups;
        this.isLocalMode = app.isLocalMode;
    }
    
    showGroupMembers(groupId) {
        this.app.currentGroupId = groupId;
        console.log('showGroupMembers called with groupId:', groupId);
        console.log('Available groups from app:', this.app.groups);
        
        // 使用 app.groups 而不是 this.groups
        const group = this.app.groups.find(g => g.id === groupId);
        
        if (!group) {
            console.error('Group not found:', groupId);
            return;
        }
        
        console.log('Showing group members for:', group.name);
        
        document.getElementById('membersGroupTitle').textContent = `${group.name} - Members`;
        document.getElementById('memberCount').textContent = `${group.members.length} members`;
        document.querySelector('.group-members-section').style.display = 'block';
        document.querySelector('.groups-section').style.display = 'none';
        document.querySelector('.group-detail-section').style.display = 'none';
        document.querySelector('.group-settings-section').style.display = 'none';
        
        this.renderMembers();
    }
    
    async renderMembers() {
        if (!this.app.currentGroupId) return;
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const list = document.getElementById('membersList');
        if (!list) return;
        
        if (this.isLocalMode) {
            // 本地模式：members 是物件陣列
            list.innerHTML = group.members.map(member => this.createMemberItem(member)).join('');
        } else {
            // Firebase 模式：members 是 UID 陣列，需要獲取用戶數據
            try {
                const memberData = await this.getMemberData(group.members);
                list.innerHTML = memberData.map(member => this.createMemberItem(member)).join('');
            } catch (error) {
                console.error('Error loading members:', error);
                list.innerHTML = '<div class="error">Failed to load members</div>';
            }
        }
    }
    
    async getMemberData(memberUids) {
        if (this.isLocalMode) return memberUids;
        
        const currentUser = this.app.currentUser;
        if (!currentUser) {
            console.error('No current user found in members manager');
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
    
    createMemberItem(member) {
        const isAdmin = member.role === 'admin';
        const currentUser = this.app.currentUser;
        const isCurrentUser = currentUser && member.id === currentUser.uid;
        
        return `
            <div class="member-item">
                <div class="member-info">
                    <div class="member-avatar">👤</div>
                    <div class="member-details">
                        <div class="member-name">${member.name}</div>
                        <div class="member-role">${isAdmin ? 'Admin' : 'Member'}</div>
                    </div>
                </div>
                <div class="member-actions">
                    ${!isCurrentUser ? `
                        <button class="pixel-button small danger" onclick="app.membersManager.removeMember('${member.id}')">
                            Remove
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    async addMember() {
        const email = document.getElementById('memberEmail').value.trim();
        if (!email) {
            alert('Please enter an email address');
            return;
        }
        
        if (!this.isLocalMode) {
            // Firebase 模式：查找用戶並添加到群組
            try {
                // 首先查找用戶是否存在
                const usersSnapshot = await this.db.collection('users')
                    .where('email', '==', email)
                    .limit(1)
                    .get();
                
                if (!usersSnapshot.empty) {
                    // 用戶存在，直接添加到群組
                    const userDoc = usersSnapshot.docs[0];
                    const userData = userDoc.data();
                    const userId = userDoc.id;
                    
                    const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
                    if (group.members.includes(userId)) {
                        alert('This user is already a member of the group');
                        return;
                    }
                    
                    // 添加到群組
                    await this.db.collection('groups').doc(this.app.currentGroupId).update({
                        members: firebase.firestore.FieldValue.arrayUnion(userId)
                    });
                    
                    // 更新本地數據
                    group.members.push(userId);
                    this.updateMemberCount();
                    this.renderMembers();
                    
                    alert(`${userData.displayName || email} has been added to the group!`);
                } else {
                    // 用戶不存在，創建邀請
                    const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
                    const groupName = group.name;
                    const currentUser = this.app.currentUser;
                    const invitedByName = currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'Unknown User';
                    
                    await this.db.collection('invitations').add({
                        groupId: this.app.currentGroupId,
                        groupName: groupName,
                        invitedEmail: email,
                        invitedBy: currentUser ? currentUser.uid : 'unknown',
                        invitedByName: invitedByName,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                    });
                    
                    alert(`Invitation sent to ${email}. They will be added to the group when they register.`);
                }
                
                document.getElementById('memberEmail').value = '';
            } catch (error) {
                console.error('Error adding member:', error);
                alert('Failed to add member: ' + error.message);
            }
        } else {
            // 本地模式：直接添加成員
            const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
            const newMember = {
                id: Date.now().toString(),
                name: email.split('@')[0], // 使用郵箱前綴作為名稱
                role: 'member',
                joinedAt: new Date().toISOString()
            };
            
            group.members.push(newMember);
            this.saveGroups();
            this.updateMemberCount();
            this.renderMembers();
            
            document.getElementById('memberEmail').value = '';
            alert('Member added successfully!');
        }
    }
    
    async removeMember(memberId) {
        if (!confirm('Are you sure you want to remove this member?')) {
            return;
        }
        
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        if (this.isLocalMode) {
            // 本地模式
            group.members = group.members.filter(member => member.id !== memberId);
            this.saveGroups();
        } else {
            // Firebase 模式
            try {
                await this.db.collection('groups').doc(this.app.currentGroupId).update({
                    members: firebase.firestore.FieldValue.arrayRemove(memberId)
                });
                
                group.members = group.members.filter(memberId => memberId !== memberId);
            } catch (error) {
                console.error('Error removing member:', error);
                alert('Failed to remove member: ' + error.message);
                return;
            }
        }
        
        this.updateMemberCount();
        this.renderMembers();
        alert('Member removed successfully!');
    }
    
    updateMemberCount() {
        const group = this.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        
        const memberCountElement = document.getElementById('memberCount');
        if (memberCountElement) {
            memberCountElement.textContent = `${group.members.length} members`;
        }
    }
    
    saveGroups() {
        if (this.isLocalMode) {
            localStorage.setItem('groups', JSON.stringify(this.app.groups));
        }
    }
}
