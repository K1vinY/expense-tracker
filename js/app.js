// 主應用程式類別
class GroupExpenseTracker {
    constructor() {
        this.groups = [];
        this.currentGroupId = null;
        this.isLocalMode = false;
        this.currentUser = null;
        this.db = null;
        this.auth = null;
        
        // 初始化管理器
        this.authManager = null;
        this.groupsManager = null;
        this.expensesManager = null;
        this.membersManager = null;
        this.balancesManager = null;
        
        this.init();
    }
    
    async init() {
        // 等待 Firebase 載入
        if (typeof firebase === 'undefined') {
            console.error('Firebase not loaded');
            return;
        }
        
        try {
            // 初始化 Firebase
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            
            // 初始化管理器
            this.authManager = new AuthManager(this);
            this.groupsManager = new GroupsManager(this);
            this.expensesManager = new ExpensesManager(this);
            this.membersManager = new MembersManager(this);
            this.balancesManager = new BalancesManager(this);
            
            // 設定身份驗證
            this.setupAuth();
            
            // 綁定事件
            this.bindEvents();
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            this.isLocalMode = true;
            this.groupsManager.loadGroups();
        }
    }
    
    setupAuth() {
        if (this.isLocalMode) {
            this.groupsManager.loadGroups();
            return;
        }
        
        // 清理舊的本地數據
        localStorage.removeItem('groups');
        
        // 監聽身份驗證狀態變化
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                console.log('User signed in:', user.email);
                
                // 確保用戶文檔存在
                await this.authManager.ensureUserDocument(user);
                
                this.showUserInfo();
                this.groupsManager.loadGroups();
            } else {
                this.currentUser = null;
                console.log('User signed out');
                this.showLoginForm();
                this.groups = [];
                this.groupsManager.renderGroups();
            }
        });
    }
    
    // 頁面導航方法
    showUserInfo() {
        console.log('showUserInfo called');
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registrationSection').style.display = 'none';
        document.getElementById('userSettingsSection').style.display = 'none';
        document.getElementById('resetPasswordSection').style.display = 'none';
        document.getElementById('userDisplayName').textContent = this.currentUser.displayName || this.currentUser.email.split('@')[0];
        
        // 確保回到主頁面
        console.log('Showing groups section');
        document.querySelector('.groups-section').style.display = 'block';
        document.querySelector('.group-detail-section').style.display = 'none';
        document.querySelector('.group-members-section').style.display = 'none';
        document.querySelector('.group-settings-section').style.display = 'none';
        document.querySelector('.group-balances-section').style.display = 'none';
        
        // 重新載入群組數據
        console.log('Loading groups...');
        this.groupsManager.loadGroups();
    }
    
    showLoginForm() {
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('loginForm').style.display = 'flex';
        document.getElementById('registrationSection').style.display = 'none';
        document.querySelector('.groups-section').style.display = 'none';
    }
    
    showRegistrationForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registrationSection').style.display = 'block';
        document.getElementById('userSettingsSection').style.display = 'none';
    }
    
    showUserSettings() {
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registrationSection').style.display = 'none';
        document.getElementById('userSettingsSection').style.display = 'block';
        document.getElementById('resetPasswordSection').style.display = 'none';
        this.loadUserSettings();
    }
    
    showResetPassword() {
        document.getElementById('userSettingsSection').style.display = 'none';
        document.getElementById('resetPasswordSection').style.display = 'block';
    }
    
    showGroupSettings(groupId) {
        this.currentGroupId = groupId;
        console.log('showGroupSettings called with groupId:', groupId);
        console.log('Available groups:', this.groups);
        
        const group = this.groups.find(g => g.id === groupId);
        
        if (!group) {
            console.error('Group not found:', groupId);
            return;
        }
        
        console.log('Showing group settings for:', group.name);
        
        document.getElementById('settingsGroupTitle').textContent = `${group.name} - Settings`;
        document.querySelector('.group-settings-section').style.display = 'block';
        document.querySelector('.groups-section').style.display = 'none';
        document.querySelector('.group-detail-section').style.display = 'none';
        document.querySelector('.group-members-section').style.display = 'none';
        document.querySelector('.group-balances-section').style.display = 'none';
        
        // 載入群組資訊到表單
        document.getElementById('groupNameEdit').value = group.name;
        document.getElementById('groupDescription').value = group.description || '';
    }
    
    loadUserSettings() {
        if (!this.currentUser) return;
        
        document.getElementById('settingsEmail').value = this.currentUser.email;
        document.getElementById('settingsName').value = this.currentUser.displayName || this.currentUser.email.split('@')[0];
    }
    
    // 綁定事件監聽器
    bindEvents() {
        // 身份驗證事件
        this.bindElement('loginBtn', 'click', () => this.authManager.login());
        this.bindElement('registerBtn', 'click', () => this.showRegistrationForm());
        this.bindElement('logoutBtn', 'click', () => this.authManager.logout());
        this.bindElement('userSettingsBtn', 'click', () => this.showUserSettings());
        
        // 註冊事件
        this.bindElement('registrationForm', 'submit', (e) => {
            e.preventDefault();
            this.authManager.register();
        });
        this.bindElement('backToLogin', 'click', () => this.showLoginForm());
        this.bindElement('cancelRegistration', 'click', () => this.showLoginForm());
        
        // 用戶設定事件
        this.bindElement('userSettingsForm', 'submit', (e) => {
            e.preventDefault();
            this.authManager.updateUserSettings();
        });
        this.bindElement('resetPasswordBtn', 'click', () => this.showResetPassword());
        this.bindElement('backFromUserSettings', 'click', () => this.showUserInfo());
        this.bindElement('cancelUserSettings', 'click', () => this.showUserInfo());
        
        // 重設密碼事件
        this.bindElement('resetPasswordForm', 'submit', (e) => {
            e.preventDefault();
            this.authManager.resetPassword();
        });
        this.bindElement('backFromResetPassword', 'click', () => this.showUserSettings());
        this.bindElement('cancelResetPassword', 'click', () => this.showUserSettings());
        
        // 群組相關事件
        this.bindElement('addGroupBtn', 'click', () => this.groupsManager.addGroup());
        this.bindElement('backToGroups', 'click', () => this.groupsManager.showGroupsView());
        this.bindElement('backFromMembers', 'click', () => this.groupsManager.showGroupDetail(this.currentGroupId));
        this.bindElement('backFromSettings', 'click', () => this.groupsManager.showGroupDetail(this.currentGroupId));
        this.bindElement('backFromBalances', 'click', () => this.groupsManager.showGroupDetail(this.currentGroupId));
        
        // 群組詳情事件 - 使用事件委託
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'manageMembers') {
                console.log('Manage Members clicked, currentGroupId:', this.currentGroupId);
                this.membersManager.showGroupMembers(this.currentGroupId);
            } else if (e.target && e.target.id === 'groupSettings') {
                console.log('Group Settings clicked, currentGroupId:', this.currentGroupId);
                this.showGroupSettings(this.currentGroupId);
            } else if (e.target && e.target.id === 'viewBalances') {
                console.log('View Balances clicked, currentGroupId:', this.currentGroupId);
                this.balancesManager.showGroupBalances(this.currentGroupId);
            }
        });
        
        // 費用表單事件
        this.bindElement('expenseForm', 'submit', (e) => {
            e.preventDefault();
            this.expensesManager.addExpense();
        });
        
        // 成員管理事件
        this.bindElement('addMemberForm', 'submit', (e) => {
            e.preventDefault();
            this.membersManager.addMember();
        });
        
        // 清除表單事件 - 按鈕不存在，移除綁定
        // this.bindElement('clearForm', 'click', () => this.expensesManager.resetForm());
    }
    
    // 安全綁定事件的方法
    bindElement(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with id '${elementId}' not found, skipping event binding`);
        }
    }
}

// 當頁面載入完成時初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GroupExpenseTracker();
});
