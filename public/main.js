// MAIN FRONTEND LOGIC
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const elements = {
        chatForm: document.getElementById('chat-form'),
        messageInput: document.getElementById('message-input'),
        chatContainer: document.getElementById('chat-container'),
        welcomeScreen: document.getElementById('welcome-screen'),
        modelSelector: document.getElementById('model-selector'),
        proLimitMsg: document.getElementById('pro-limit-msg'),
        proLimitCount: document.getElementById('pro-limit-count'),
        newChatBtn: document.getElementById('new-chat-btn'),
        historyContainer: document.getElementById('history-container'),
        userProfile: document.getElementById('user-profile'),
        authModalBackdrop: document.getElementById('auth-modal-backdrop'),
        loginFormContainer: document.getElementById('login-form-container'),
        signupFormContainer: document.getElementById('signup-form-container'),
        loginForm: document.getElementById('login-form'),
        signupForm: document.getElementById('signup-form'),
        showSignup: document.getElementById('show-signup'),
        showLogin: document.getElementById('show-login'),
        authCloseBtns: document.querySelectorAll('.auth-close-btn'),
        toast: document.getElementById('toast'),
        sidebar: document.getElementById('sidebar'),
        menuToggle: document.getElementById('menu-toggle'),
        darkModeToggle: document.getElementById('dark-mode-toggle'),
    };

    // --- App State ---
    const state = {
        currentConversationId: null,
        conversationHistory: [],
        token: localStorage.getItem('authToken'),
        user: null,
    };

    // --- API Configuration ---
    const API_BASE_URL = ''; // Leave empty for same-origin requests

    // --- Utility Functions ---
    const showToast = (message, isError = false) => {
        elements.toast.textContent = message;
        elements.toast.className = `fixed bottom-5 right-5 py-2 px-4 rounded-lg shadow-lg transition-all duration-300 translate-y-0 opacity-100 ${isError ? 'bg-red-600' : 'bg-gray-900'} text-white`;
        setTimeout(() => {
            elements.toast.className = elements.toast.className.replace('translate-y-0 opacity-100', 'translate-y-20 opacity-0');
        }, 3000);
    };

    const apiRequest = async (endpoint, method, body = null) => {
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : null,
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'An error occurred');
            }
            return data;
        } catch (error) {
            showToast(error.message, true);
            console.error(`API Error on ${endpoint}:`, error);
            if (error.message.toLowerCase().includes('token')) logout();
            throw error;
        }
    };

    // --- Dark Mode --- 
    const setupDarkMode = () => {
        if (localStorage.getItem('darkMode') === 'true' || 
           (!('darkMode' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        elements.darkModeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('darkMode', isDark);
        });
    };

    // --- UI Rendering ---
    const renderUserProfile = () => {
        if (state.user) {
            elements.userProfile.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-sky-200 dark:bg-gray-600 flex items-center justify-center font-bold text-sky-800 dark:text-sky-300">
                            ${state.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p class="font-semibold">${state.user.name}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">الخطة المجانية</p>
                        </div>
                    </div>
                    <button id="logout-btn" class="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500" title="تسجيل الخروج">
                        <i data-lucide="log-out"></i>
                    </button>
                </div>`;
            document.getElementById('logout-btn').addEventListener('click', logout);
        } else {
            elements.userProfile.innerHTML = `
                <div class="text-center">
                    <button id="login-prompt-btn" class="w-full p-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors">تسجيل الدخول</button>
                </div>`;
            document.getElementById('login-prompt-btn').addEventListener('click', showAuthModal);
        }
        lucide.createIcons();
    };

    const renderConversationHistory = async () => {
        if (!state.token) {
            elements.historyContainer.innerHTML = '<p class="text-center text-sm text-gray-400">قم بتسجيل الدخول لعرض المحادثات.</p>';
            return;
        }
        try {
            const { conversations } = await apiRequest('/conversations', 'GET');
            elements.historyContainer.innerHTML = '';
            if (conversations.length === 0) {
                elements.historyContainer.innerHTML = '<p class="text-center text-sm text-gray-400">لا توجد محادثات بعد.</p>';
                return;
            }
            conversations.forEach(convo => {
                const item = document.createElement('div');
                item.className = `history-item ${convo.id === state.currentConversationId ? 'active' : ''}`;
                item.dataset.id = convo.id;
                item.innerHTML = `<span class="truncate">${convo.title}</span>`;
                item.addEventListener('click', () => loadConversation(convo.id));
                elements.historyContainer.appendChild(item);
            });
        } catch (error) {
            console.error('Failed to load history:', error);
            elements.historyContainer.innerHTML = '<p class="text-center text-sm text-red-400">فشل تحميل المحادثات.</p>';
        }
    };

    const displayMessage = (sender, message, options = {}) => {
        elements.welcomeScreen.classList.add('hidden');
        const messageId = `msg-${Date.now()}`;
        const messageElement = document.createElement('div');
        messageElement.classList.add('mb-4', 'flex', 'items-end', 'gap-3');
        
        let formattedMessage = message;
        if (options.isMarkdown) {
            try {
                formattedMessage = marked.parse(message.replace(/```(\w+)/g, '```\n$1'));
            } catch (e) {
                formattedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
        }

        const logoHTML = `<img src="https://placehold.co/32x32/0b3d91/ffffff?text=M&font=raleway" alt="MOHO Logo" class="w-8 h-8 rounded-full shadow-md">`;
        const userAvatarHTML = state.user ? `<div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center font-bold">${state.user.name.charAt(0).toUpperCase()}</div>` : '';

        if (sender === 'user') {
            messageElement.classList.add('justify-end');
            messageElement.innerHTML = `<div class="chat-bubble-user order-1">${formattedMessage}</div><div class="order-2">${userAvatarHTML}</div>`;
        } else {
            messageElement.classList.add('justify-start');
            messageElement.id = options.isLoading ? 'loading-indicator' : messageId;
            const bubbleContent = options.isLoading ? `<span class="animate-pulse">يفكر...</span>` : `<div class="prose dark:prose-invert max-w-none">${formattedMessage}</div>`;
            messageElement.innerHTML = `<div class="order-2">${logoHTML}</div><div class="chat-bubble-ai order-1">${bubbleContent}</div>`;
        }

        elements.chatContainer.appendChild(messageElement);
        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
        
        if (sender === 'ai' && !options.isLoading) {
            addCopyButtons(messageElement);
        }
    };

    const addCopyButtons = (messageElement) => {
        messageElement.querySelectorAll('pre').forEach(pre => {
            const button = document.createElement('button');
            button.className = 'copy-btn';
            button.innerHTML = `<i data-lucide="copy" class="w-4 h-4"></i>`;
            button.onclick = () => {
                const code = pre.querySelector('code').innerText;
                navigator.clipboard.writeText(code).then(() => {
                    showToast('تم نسخ الكود!');
                }, () => {
                    showToast('فشل النسخ.', true);
                });
            };
            pre.appendChild(button);
        });
        lucide.createIcons();
    };

    // --- Auth Logic ---
    const showAuthModal = (type = 'login') => {
        elements.authModalBackdrop.classList.remove('hidden');
        elements.authModalBackdrop.classList.add('flex');
        setTimeout(() => {
            if (type === 'login') {
                elements.loginFormContainer.classList.remove('hidden', 'scale-95', 'opacity-0');
                elements.signupFormContainer.classList.add('hidden', 'scale-95', 'opacity-0');
            } else {
                elements.signupFormContainer.classList.remove('hidden', 'scale-95', 'opacity-0');
                elements.loginFormContainer.classList.add('hidden', 'scale-95', 'opacity-0');
            }
        }, 50);
    };

    const hideAuthModal = () => {
        elements.loginFormContainer.classList.add('scale-95', 'opacity-0');
        elements.signupFormContainer.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            elements.authModalBackdrop.classList.add('hidden');
            elements.authModalBackdrop.classList.remove('flex');
        }, 300);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const data = await apiRequest('/login', 'POST', {
                email: elements.loginForm.email.value,
                password: elements.loginForm.password.value,
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('authToken', state.token);
            hideAuthModal();
            initializeApp();
            showToast('أهلاً بك مجدداً!');
        } catch (error) {}
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        try {
            const data = await apiRequest('/register', 'POST', {
                name: elements.signupForm.name.value,
                email: elements.signupForm.email.value,
                password: elements.signupForm.password.value,
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('authToken', state.token);
            hideAuthModal();
            initializeApp();
            showToast('تم إنشاء الحساب بنجاح!');
        } catch (error) {}
    };
    
    const logout = () => {
        state.token = null;
        state.user = null;
        state.currentConversationId = null;
        state.conversationHistory = [];
        localStorage.removeItem('authToken');
        initializeApp();
        showToast('تم تسجيل الخروج.');
    };

    // --- Chat Logic ---
    const startNewChat = () => {
        state.currentConversationId = null;
        state.conversationHistory = [];
        elements.chatContainer.innerHTML = '';
        elements.chatContainer.appendChild(elements.welcomeScreen);
        elements.welcomeScreen.classList.remove('hidden');
        document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
    };

    const loadConversation = async (id) => {
        if (id === state.currentConversationId) return;
        try {
            const data = await apiRequest(`/conversations/${id}`, 'GET');
            state.currentConversationId = id;
            state.conversationHistory = data.messages;
            elements.chatContainer.innerHTML = '';
            data.messages.forEach(msg => displayMessage(msg.role, msg.parts[0].text, { isMarkdown: true }));
            renderConversationHistory(); // To highlight the active one
        } catch (error) {
            showToast('فشل تحميل المحادثة.', true);
        }
    };

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        const userInput = elements.messageInput.value.trim();
        if (!userInput) return;

        displayMessage('user', userInput, { isMarkdown: false });
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
        displayMessage('ai', '', { isLoading: true });

        try {
            const data = await apiRequest('/chat', 'POST', {
                message: userInput,
                conversationId: state.currentConversationId,
                model: elements.modelSelector.value,
            });

            document.getElementById('loading-indicator')?.remove();

            if (!state.currentConversationId) { // First message in a new chat
                state.currentConversationId = data.conversationId;
                renderConversationHistory(); // Refresh history to show new chat
            }
            
            state.conversationHistory = data.history;
            const aiResponse = data.history[data.history.length - 1].parts[0].text;
            displayMessage('ai', aiResponse, { isMarkdown: true });

        } catch (error) {
            document.getElementById('loading-indicator')?.remove();
            displayMessage('ai', 'عذراً، حدث خطأ أثناء معالجة طلبك.', { isMarkdown: false });
        }
    };

    // --- Initialization ---
    const initializeApp = async () => {
        renderUserProfile();
        startNewChat();
        if (state.token) {
            try {
                const data = await apiRequest('/verify', 'GET');
                state.user = data.user;
                renderUserProfile();
                renderConversationHistory();
            } catch (error) {
                // Token is invalid, logout
                logout();
            }
        } else {
            renderConversationHistory();
        }
    };

    // --- Event Listeners ---
    elements.chatForm.addEventListener('submit', handleChatSubmit);
    elements.newChatBtn.addEventListener('click', startNewChat);
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.signupForm.addEventListener('submit', handleSignup);
    elements.showSignup.addEventListener('click', (e) => { e.preventDefault(); showAuthModal('signup'); });
    elements.showLogin.addEventListener('click', (e) => { e.preventDefault(); showAuthModal('login'); });
    elements.authCloseBtns.forEach(btn => btn.addEventListener('click', hideAuthModal));
    elements.menuToggle.addEventListener('click', () => elements.sidebar.classList.toggle('-translate-x-full'));

    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = `${elements.messageInput.scrollHeight}px`;
    });

    // --- Initial Load ---
    setupDarkMode();
    initializeApp();
    lucide.createIcons();
});
