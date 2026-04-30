let supabaseClient = null;
let _supabaseInitPromise = null;

async function initSupabase() {
    console.log('DEBUG: initSupabase starting...');
    if (supabaseClient) return supabaseClient;
    if (_supabaseInitPromise) return _supabaseInitPromise;

    _supabaseInitPromise = (async () => {
        try {
            const SUPABASE_URL = "https://zunbyktoldkxwcgrcytf.supabase.co";
            const SUPABASE_ANON_KEY = "sb_publishable_eQ6OSbTVASZElxHC0JMmwg_13yf2ijf";

            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            window.supabaseClient = supabaseClient;
            console.log('DEBUG: Supabase client created successfully');
            return supabaseClient;
        } catch (error) {
            console.error('DEBUG: Error initializing Supabase:', error);
            return null;
        } finally {
            _supabaseInitPromise = null;
        }
    })();

    return _supabaseInitPromise;
}

/**
 * Fetch the role for a given user from the profiles table.
 * Returns 'user' as a safe default if lookup fails.
 */
async function getUserRole(client, userId, forceRefresh = true) {
    // Return cached role only if explicitly allowed, to avoid admin locked-out loops
    if (!forceRefresh) {
        const cachedRole = localStorage.getItem('sp_user_role');
        if (cachedRole) return cachedRole;
    }

    try {
        const { data, error } = await client
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('DEBUG: Profile fetch error:', error);
            return 'user';
        }
        
        if (!data) {
            console.warn('DEBUG: No profile found for user:', userId);
            return 'user';
        }

        const role = data.role || 'user';
        localStorage.setItem('sp_user_role', role); // Cache it
        return role;
    } catch (e) {
        console.error('DEBUG: Unexpected error fetching user role:', e);
        return 'user';
    }
}

/**
 * Redirect to the correct page based on user role.
 * Always uses absolute paths to avoid /auth/admin.html type bugs.
 * Admin → /admin.html, everyone else → /dashboard.html
 */
let _isRedirecting = false;
async function redirectByRole(client, userId, useRelativePath = false) {
    if (_isRedirecting) {
        console.log('DEBUG: already redirecting, skipping...');
        return;
    }
    _isRedirecting = true;
    console.log('DEBUG: Fetching user role for:', userId);
    
    // Show a loading overlay while querying the profiles table
    let loader = document.getElementById('global-role-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-role-loader';
        loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#080818;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:99999;color:white;transition:opacity 0.3s;';
        const logoPath = window.location.pathname.includes('/auth/') ? '../img/logo.png' : 'img/logo.png';
        loader.innerHTML = `
            <div style="width:70px;height:70px;margin-bottom:25px;animation:pulse-logo 1.8s ease-in-out infinite;filter:drop-shadow(0 0 20px rgba(124,111,224,0.4));">
                <img src="${logoPath}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;">
            </div>
            <h3 style="margin:0;font-family:'Cairo',sans-serif;font-size:20px;font-weight:800;background:linear-gradient(135deg,#fff,#7c6fe0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">جاري توجيهك...</h3>
            <div style="width: min(300px, 80vw); margin-top:20px; display:flex; flex-direction:column; gap:8px;">
                <div style="height:12px; width:100%; background:rgba(255,255,255,0.05); border-radius:6px; overflow:hidden; position:relative;">
                    <div style="position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(124,111,224,0.2),transparent); animation:shimmer 1.5s infinite;"></div>
                </div>
                <div style="height:10px; width:60%; align-self:center; background:rgba(255,255,255,0.03); border-radius:5px; overflow:hidden; position:relative;">
                    <div style="position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(124,111,224,0.1),transparent); animation:shimmer 1.5s infinite; animation-delay:0.2s;"></div>
                </div>
            </div>
            <style>
                @keyframes pulse-logo { 0%, 100% { transform: scale(1); opacity:0.9; } 50% { transform: scale(1.08); opacity:1; } }
                @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            </style>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
    loader.style.opacity = '1';

    const role = await getUserRole(client, userId);
    console.log('DEBUG: User role is:', role);
    localStorage.setItem('sp_user_role', role); // Ensure it's cached
    
    const target = (role === 'admin') ? '/admin.html' : '/dashboard.html';
    console.log('DEBUG: Redirecting to:', target);
    
    // Using replace to prevent back-button loops during login
    window.location.replace(target);
    
    // Fallback if browser blocks navigation
    setTimeout(() => { 
        _isRedirecting = false; 
        console.warn('DEBUG: Redirect timeout, resetting flag');
        if (loader) loader.style.display = 'none';
    }, 5000);
}

// Ensure initializing on load
initSupabase().then(() => {
    checkSession();

    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                // Cache user meta for instant dashboard loading
                if (session.user && session.user.user_metadata) {
                    localStorage.setItem('sp_user_meta', JSON.stringify(session.user.user_metadata));
                    localStorage.setItem('sp_user_email', session.user.email);
                }

                // Only redirect if NOT on an auth page, dashboard, or admin/supervisor pages
                // Auth pages handle their own redirect after login/signup
                const path = window.location.pathname;
                if (!path.includes('/auth/') && 
                    !path.includes('/dashboard.html') && 
                    !path.includes('/admin.html') && 
                    !path.includes('/supervisor.html')) {
                    await redirectByRole(supabaseClient, session.user.id);
                }
            }
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem('sp_user_meta');
                localStorage.removeItem('sp_user_email');
                localStorage.removeItem('sp_user_role');
            }
        });
    }
});


async function checkSession() {
    console.log('DEBUG: checkSession starting...');
    if (!supabaseClient) {
        console.log('DEBUG: supabaseClient missing in checkSession, calling initSupabase...');
        await initSupabase();
    }
    if (!supabaseClient) {
        console.warn('Supabase client not initialized. Authentication skipped.');
        return;
    }

    try {
        console.log('DEBUG: Fetching session...');
        const { data: { session } } = await supabaseClient.auth.getSession();
        console.log('DEBUG: Session result:', session ? 'Found' : 'Not Found');
        
        const path = window.location.pathname;
        const isAuthPage = path.includes('/auth/') || path.includes('/login') || path.includes('/signup') || path.includes('/callback');
        const isIndexPage = path === '/' || path.endsWith('/index.html') || path.endsWith('/index') || path === '';
        const isDashboardPage = path.includes('dashboard.html') || path.endsWith('/dashboard');
        const isAdminPage = path.includes('admin.html') || path.includes('supervisor.html') || path.endsWith('/admin');
        
        console.log('DEBUG: Current path info:', { path, isAuthPage, isIndexPage, isDashboardPage, isAdminPage });

        if (session) {
            console.log('DEBUG: User is logged in:', session.user.id);
            
            // Fetch role to ensure proper redirection
            const role = await getUserRole(supabaseClient, session.user.id);
            console.log('DEBUG: User role for checkSession:', role);

            // AUTO-REDIRECT ADMINS AWAY FROM STUDENT DASHBOARD
            if (role === 'admin' && isDashboardPage) {
                console.log('DEBUG: Admin detected on student dashboard, redirecting to admin panel...');
                window.location.replace('/admin.html');
                return;
            }

            if (isAuthPage || isIndexPage) {
                console.log('DEBUG: On auth/index page, triggering redirectByRole...');
                await redirectByRole(supabaseClient, session.user.id);
            }
        } else {
            console.log('DEBUG: User is NOT logged in');
            // Only redirect if NOT on an auth page and on a protected page
            const isProtected = path.includes('admin.html') || path.includes('dashboard.html') || path.includes('supervisor.html');
            if (isProtected && !isAuthPage) {
                console.log('DEBUG: Protected page access without session, redirecting to login...');
                window.location.href = '/auth/login.html';
            }
        }
    } catch (e) {
        console.error('DEBUG: Error in checkSession:', e);
    }
}

// --- OAuth Login ---
async function loginWithGoogle() {
    if (!supabaseClient) await initSupabase();
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/auth/callback.html'
        }
    });
    if (error) {
        if (window.dmAlert) dmAlert(error.message);
        else alert(error.message);
    }
}

async function loginWithFacebook() {
    if (!supabaseClient) await initSupabase();
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
            redirectTo: window.location.origin + '/auth/callback'
        }
    });
    if (error) {
        if (window.dmAlert) dmAlert(error.message);
        else alert(error.message);
    }
}

// --- Email Login/Signup ---
// NOTE: handleEmailLogin is defined inline in login.html
// NOTE: handleEmailSignup is defined inline in signup.html
// This avoids duplication and allows each page to have its own UI logic.

// --- Phone Auth ---
async function handleSendOTP(event) {
    event.preventDefault();
    const phone = document.getElementById('phoneNumber').value;

    if (!supabaseClient) await initSupabase();
    const { data, error } = await supabaseClient.auth.signInWithOtp({ phone });

    if (error) {
        if (window.dmAlert) dmAlert(error.message);
        else alert(error.message);
    } else {
        document.getElementById('phone-input-section').classList.add('hidden');
        document.getElementById('phone-input-section').style.display = 'none';
        document.getElementById('otp-section').classList.remove('hidden');
        document.getElementById('otp-section').style.display = 'block';
        if (window.dmAlert) dmAlert("تم إرسال الرمز! / OTP sent!");
        else alert("تم إرسال الرمز! / OTP sent!");
    }
}

async function handleVerifyOTP(event) {
    event.preventDefault();
    const phone = document.getElementById('phoneNumber').value;
    const token = document.getElementById('otpCode').value;

    if (!supabaseClient) await initSupabase();
    const { data, error } = await supabaseClient.auth.verifyOtp({
        phone,
        token,
        type: 'sms'
    });

    if (error) {
        if (window.dmAlert) dmAlert(error.message);
        else alert(error.message);
    } else {
        // Role-based redirect
        await redirectByRole(supabaseClient, data.user.id, true);
    }
}

// --- Logout ---
async function logout() {
    try {
        if (!supabaseClient) await initSupabase();
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }
    } catch (e) {
        console.error('Logout signOut error:', e);
    } finally {
        // Always clear storage and redirect
        localStorage.removeItem('sp_user_meta');
        localStorage.removeItem('sp_user_email');
        localStorage.removeItem('sp_user_role');
        window.location.href = '/auth/login.html';
    }
}
