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
        
        document.getElementById('membersGroupTitle').textContent = 'Members';
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
        
        try {
            // 現有成員
            const activeMembers = this.isLocalMode
                ? group.members
                : await this.getMemberData(group.members);

            // 待加入成員（以 email 表示）
            const pendingEmails = Array.isArray(group.pendingMembers) ? group.pendingMembers : [];
            const pendingMembers = pendingEmails.map(email => ({
                id: email,
                name: email,
                role: 'pending',
                joinedAt: null
            }));

            const allMembers = [...activeMembers, ...pendingMembers];
            list.innerHTML = allMembers.map(member => this.createMemberItem(member)).join('');
        } catch (error) {
            console.error('Error loading members:', error);
            list.innerHTML = '<div class="error">Failed to load members</div>';
        }
    }
    
    async getMemberData(memberUids) {
        if (this.isLocalMode) return memberUids;
        
        const currentUser = this.app.currentUser;
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        const ownerUid = group ? group.createdBy : null;
        
        try {
            const memberPromises = memberUids.map(async (uid) => {
                // 讀取名稱
                let name = uid.substring(0, 8) + '...';
                try {
                    if (currentUser && uid === currentUser.uid) {
                        name = currentUser.displayName || currentUser.email.split('@')[0];
                    } else {
                        const userDoc = await this.db.collection('users').doc(uid).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            name = userData.displayName || userData.email.split('@')[0];
                        }
                    }
                } catch (error) {
                    console.error('Error fetching user data for UID:', uid, error);
                }
                
                // 角色由群組建立者決定
                const role = ownerUid && uid === ownerUid ? 'admin' : 'member';
                return {
                    id: uid,
                    name,
                    role,
                    joinedAt: new Date().toISOString()
                };
            });
            
            return await Promise.all(memberPromises);
        } catch (error) {
            console.error('Error getting member data:', error);
            return memberUids.map(uid => ({
                id: uid,
                name: uid.substring(0, 8) + '...',
                role: ownerUid && uid === ownerUid ? 'admin' : 'member',
                joinedAt: new Date().toISOString()
            }));
        }
    }
    
    createMemberItem(member) {
        const isAdmin = member.role === 'admin';
        const currentUser = this.app.currentUser;
        const isCurrentUser = currentUser && member.id === currentUser.uid;
        const isPending = member.role === 'pending';
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        const isCurrentUserAdmin = group && group.createdBy === (currentUser ? currentUser.uid : '');
        
        return `
            <div class="member-item">
                <div class="member-info">
                    <div class="member-avatar">👤</div>
                    <div class="member-details">
                        <div class="member-name">${member.name}</div>
                        <div class="member-role">${isPending ? 'Pending' : (isAdmin ? 'Admin' : 'Member')}</div>
                    </div>
                </div>
                <div class="member-actions">
                    ${isPending ? `
                        <button class="pixel-button small danger" onclick="app.membersManager.removePendingMember('${member.id}')">
                            Remove
                        </button>
                    ` : (isCurrentUserAdmin && !isCurrentUser ? `
                        <button class="pixel-button small danger" onclick="app.membersManager.removeMember('${member.id}')">
                            Remove
                        </button>
                    ` : '')}
                </div>
            </div>
        `;
    }
    
    async addMember() {
        // 兼容不同欄位 ID（index-modular.html 使用 memberName 作為 Email 欄位）
        const emailInput = document.getElementById('memberEmail') || document.getElementById('memberName');
        const email = emailInput ? emailInput.value.trim() : '';
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

                    // 檢查是否已經有相同群組、相同 email 的 pending 邀請，避免重複
                    const existingInviteSnap = await this.db.collection('invitations')
                        .where('groupId', '==', this.app.currentGroupId)
                        .where('invitedEmail', '==', email)
                        .where('status', '==', 'pending')
                        .limit(1)
                        .get();
                    if (!existingInviteSnap.empty) {
                        alert(`Invitation to ${email} is already pending for this group.`);
                        // 仍確保本地 pendingMembers 有此 email
                        await this.db.collection('groups').doc(this.app.currentGroupId).update({
                            pendingMembers: firebase.firestore.FieldValue.arrayUnion(email)
                        });
                        if (!Array.isArray(group.pendingMembers)) group.pendingMembers = [];
                        if (!group.pendingMembers.includes(email)) group.pendingMembers.push(email);
                        this.renderMembers();
                        return;
                    }
                    
                    await this.db.collection('invitations').add({
                        groupId: this.app.currentGroupId,
                        groupName: groupName,
                        invitedEmail: email,
                        invitedBy: currentUser ? currentUser.uid : 'unknown',
                        invitedByName: invitedByName,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                    });

                    // 將待加入成員寫入群組文件 pendingMembers 陣列
                    await this.db.collection('groups').doc(this.app.currentGroupId).update({
                        pendingMembers: firebase.firestore.FieldValue.arrayUnion(email)
                    });
                    // 更新本地資料
                    if (!Array.isArray(group.pendingMembers)) group.pendingMembers = [];
                    if (!group.pendingMembers.includes(email)) group.pendingMembers.push(email);
                    this.renderMembers();
                    
                    alert(`Invitation sent to ${email}. They will be added to the group when they register.`);
                }
                
                // 清空輸入框（兼容 memberEmail / memberName）
                const emailInputAfter = document.getElementById('memberEmail') || document.getElementById('memberName');
                if (emailInputAfter) emailInputAfter.value = '';
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
            
            // 清空輸入框（兼容 memberEmail / memberName）
            const emailInputAfter = document.getElementById('memberEmail') || document.getElementById('memberName');
            if (emailInputAfter) emailInputAfter.value = '';
            alert('Member added successfully!');
        }
    }
    
    async removeMember(memberId) {
        if (!confirm('Are you sure you want to remove this member?')) {
            return;
        }
        
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        const currentUser = this.app.currentUser;
        if (!currentUser || !group || group.createdBy !== currentUser.uid) {
            alert('Only the group owner can remove members.');
            return;
        }
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
                
                // Firebase 模式下 members 為 UID 陣列
                group.members = group.members.filter(uid => uid !== memberId);
            } catch (error) {
                console.error('Error removing member:', error);
                alert('Failed to remove member: ' + error.message);
                return;
            }
        }
        
        this.updateMemberCount();
        // 立即刷新群組列表與當前頁
        if (this.app && this.app.groupsManager && this.app.groupsManager.loadGroups) {
            await this.app.groupsManager.loadGroups();
        }
        this.renderMembers();
        alert('Member removed successfully!');
    }

    async removePendingMember(email) {
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
        if (!group) return;
        if (!confirm('Are you sure you want to remove this pending member?')) return;

        if (this.isLocalMode) {
            if (!Array.isArray(group.pendingMembers)) group.pendingMembers = [];
            group.pendingMembers = group.pendingMembers.filter(e => e !== email);
            this.saveGroups();
        } else {
            try {
                await this.db.collection('groups').doc(this.app.currentGroupId).update({
                    pendingMembers: firebase.firestore.FieldValue.arrayRemove(email)
                });
                if (!Array.isArray(group.pendingMembers)) group.pendingMembers = [];
                group.pendingMembers = group.pendingMembers.filter(e => e !== email);
            } catch (error) {
                console.error('Error removing pending member:', error);
                alert('Failed to remove pending member: ' + error.message);
                return;
            }
        }
        this.renderMembers();
    }
    
    updateMemberCount() {
        const group = this.app.groups.find(g => g.id === this.app.currentGroupId);
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
