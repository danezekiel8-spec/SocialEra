const statusMessage = document.getElementById('status-message');
const accountName = document.getElementById('account-name');
const accountEmail = document.getElementById('account-email');
const metaCreated = document.getElementById('meta-created');
const metaId = document.getElementById('meta-id');
const avatar = document.getElementById('avatar');
const logoutButton = document.getElementById('logout-button');
const profileTitle = document.getElementById('profile-title');
const profileSubtitle = document.getElementById('profile-subtitle');
const profileStats = document.getElementById('profile-stats');
const profileAvatar = document.getElementById('profile-avatar');
const profileBadgeName = document.getElementById('profile-badge-name');
const profilePostsGrid = document.getElementById('profile-posts-grid');
const headerProfileLink = document.getElementById('header-profile-link');
const headerCartCount = document.getElementById('header-cart-count') || document.getElementById('cart-count');

function showStatus(message, type){
  statusMessage.textContent = message;
  statusMessage.className = `status show ${type}`;
}

function formatDate(value){
  if(!value){
    return '—';
  }

  const date = new Date(value);

  if(Number.isNaN(date.getTime())){
    return '—';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getInitials(name, email){
  const safeName = String(name || '').trim();

  if(safeName){
    const parts = safeName.split(/\s+/).filter(Boolean).slice(0,2);
    return parts.map(part => part.charAt(0).toUpperCase()).join('') || 'L';
  }

  return String(email || 'L').charAt(0).toUpperCase();
}

function updateHeaderCartCount(){
  if(!headerCartCount){
    return;
  }

  const cart = JSON.parse(localStorage.getItem('lovadaCart') || '[]');
  const total = Array.isArray(cart) ? cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
  headerCartCount.textContent = total;
}

function renderHeaderProfile(fullName, email, photoUrl = ''){
  if(!headerProfileLink){
    return;
  }

  const safeName = String(fullName || 'SocialEra Member').replace(/"/g, '&quot;');
  const safePhoto = String(photoUrl || '').trim().replace(/"/g, '&quot;');
  const initials = getInitials(fullName, email);

  headerProfileLink.setAttribute('title', safeName);
  headerProfileLink.setAttribute('aria-label', safeName);
  headerProfileLink.innerHTML = safePhoto
    ? `<img src="${safePhoto}" alt="${safeName}" class="header-profile-avatar-image">`
    : `<span class="header-profile-avatar-fallback">${initials}</span>`;
}

function shortenId(value){
  const text = String(value || '');

  if(text.length <= 12){
    return text || '—';
  }

  return `${text.slice(0,6)}...${text.slice(-4)}`;
}

function normalizeText(value){
  return String(value || '').toLowerCase().trim();
}

function parseCount(value){
  const text = String(value || '0').trim().toLowerCase();
  const number = parseFloat(text.replace(/,/g,''));

  if(!Number.isFinite(number)){
    return 0;
  }

  if(text.endsWith('k')){
    return Math.round(number * 1000);
  }

  if(text.endsWith('m')){
    return Math.round(number * 1000000);
  }

  return Math.round(number);
}

function formatCount(value){
  const number = Number(value || 0);

  if(number >= 1000000){
    const formatted = (number / 1000000).toFixed(number >= 10000000 ? 0 : 1);
    return `${formatted.replace(/\.0$/,'')}m`;
  }

  if(number >= 1000){
    const formatted = (number / 1000).toFixed(number >= 10000 ? 0 : 1);
    return `${formatted.replace(/\.0$/,'')}k`;
  }

  return String(number);
}

function buildProfileIdentity(user){
  const fullName = String(user?.user_metadata?.full_name || 'SocialEra Member').trim() || 'SocialEra Member';
  const usernameBase = String(user?.user_metadata?.username || user?.email?.split('@')[0] || 'socialera.member').trim().replace(/^@+/,'') || 'socialera.member';

  return {
    fullName,
    handle: `@${usernameBase}`
  };
}

function renderProfileStats(posts){
  const postCount = posts.length;
  const totalLikes = posts.reduce((sum,post)=>sum + parseCount(post.likes),0);
  const totalComments = posts.reduce((sum,post)=>sum + parseCount(post.commentsCount ?? post.comments),0);
  const totalShares = posts.reduce((sum,post)=>sum + parseCount(post.shares ?? post.saves),0);

  profileStats.innerHTML = `
    <div class="profile-stat">
      <strong>${formatCount(postCount)}</strong>
      <span>Posts</span>
    </div>
    <div class="profile-stat">
      <strong>${formatCount(totalLikes)}</strong>
      <span>Likes</span>
    </div>
    <div class="profile-stat">
      <strong>${formatCount(totalComments)}</strong>
      <span>Comments</span>
    </div>
    <div class="profile-stat">
      <strong>${formatCount(totalShares)}</strong>
      <span>Shares</span>
    </div>
  `;
}

function renderProfilePosts(posts){
  if(!posts.length){
    profilePostsGrid.innerHTML = `
      <div class="profile-post-empty">
        You do not have any SocialEra posts yet. Once you publish from the homepage, they will appear here as part of your profile.
      </div>
    `;
    return;
  }

  profilePostsGrid.innerHTML = posts.map(post => `
    <article class="profile-post-card">
      ${post.mediaType === 'video'
        ? `<video src="${String(post.mediaUrl || '')}" controls playsinline preload="metadata"></video>`
        : `<img src="${String(post.mediaUrl || '')}" alt="${String(post.captionTitle || 'Profile post').replace(/"/g,'&quot;')}">`}
      <div class="profile-post-card-body">
        <h4>${String(post.captionTitle || 'Untitled post')}</h4>
        <p>${String(post.captionText || '')}</p>
        <div class="profile-post-card-meta">
          <span>${formatCount(post.likes)} likes</span>
          <span>${formatCount(post.commentsCount ?? post.comments)} comments</span>
          <span>${formatCount(post.shares ?? post.saves)} shares</span>
        </div>
      </div>
    </article>
  `).join('');
}

function clearRecentLoginHandoff(){
  try{
    sessionStorage.removeItem('socialera-login-handoff');
  }catch(error){
    // no-op
  }
}

function hasRecentLoginHandoff(){
  try{
    const timestamp = Number(sessionStorage.getItem('socialera-login-handoff') || 0);
    return Boolean(timestamp && Date.now() - timestamp < 15000);
  }catch(error){
    return false;
  }
}

async function loadProfilePosts(user){
  const identity = buildProfileIdentity(user);

  profileTitle.textContent = `${identity.fullName}'s SocialEra profile`;
  profileSubtitle.textContent = 'Your account details live here, but so does your public SocialEra identity: the posts, media, and engagement tied to your presence.';
  profileBadgeName.textContent = identity.fullName;

  try{
    const response = await fetch('/api/social/posts', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if(!response.ok){
      throw new Error(`Request failed: ${response.status}`);
    }

    const posts = await response.json();
    const normalizedHandle = normalizeText(identity.handle);
    const normalizedName = normalizeText(identity.fullName);
    const ownedPosts = Array.isArray(posts)
      ? posts.filter(post => normalizeText(post.userName) === normalizedHandle || normalizeText(post.displayName) === normalizedName)
      : [];

    renderProfileStats(ownedPosts);
    renderProfilePosts(ownedPosts);
  }catch(error){
    console.error(error);
    profileStats.innerHTML = '';
    profilePostsGrid.innerHTML = `
      <div class="profile-post-empty">
        We could not load your profile posts right now.
      </div>
    `;
  }
}

async function getReadySupabase(){
  if(window.supabase && window.supabase.auth){
    return window.supabase;
  }

  if(typeof window.ensureSocialEraSupabase === 'function'){
    return window.ensureSocialEraSupabase();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('socialera:supabase-ready', handleReady);
      window.removeEventListener('socialera:supabase-error', handleError);
      reject(new Error('Supabase did not load in time.'));
    }, 5000);

    function finish(client){
      window.clearTimeout(timeout);
      window.removeEventListener('socialera:supabase-ready', handleReady);
      window.removeEventListener('socialera:supabase-error', handleError);
      resolve(client);
    }

    function handleReady(event){
      const client = event && event.detail ? event.detail.supabase : window.supabase;
      finish(client);
    }

    function handleError(event){
      window.clearTimeout(timeout);
      window.removeEventListener('socialera:supabase-ready', handleReady);
      window.removeEventListener('socialera:supabase-error', handleError);
      reject(event && event.detail && event.detail.error ? event.detail.error : new Error('Supabase failed to load.'));
    }

    window.addEventListener('socialera:supabase-ready', handleReady, { once: true });
    window.addEventListener('socialera:supabase-error', handleError, { once: true });
  });
}

async function loadAccount(){
  const supabase = await getReadySupabase().catch((error) => {
    console.error(error);
    return null;
  });

  if(!supabase){
    showStatus('Supabase is not connected yet.', 'error');
    return;
  }

  try{
    let user = null;
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

    if(session && session.user){
      user = session.user;
    }

    if(!user && hasRecentLoginHandoff()){
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      const retryResult = await supabase.auth.getSession();
      const retrySession = retryResult && retryResult.data ? retryResult.data.session : null;
      user = retrySession && retrySession.user ? retrySession.user : null;
    }

    if(!user){
      window.location.href = 'login.html';
      return;
    }

    const userResult = await supabase.auth.getUser();
    if(userResult && userResult.data && userResult.data.user){
      user = userResult.data.user;
    }

    clearRecentLoginHandoff();

    const fullName = user.user_metadata?.full_name || 'SocialEra Member';
    const email = user.email || '—';
    const createdAt = user.created_at || '';
    const photoUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || user.user_metadata?.avatar || '';

    accountName.textContent = fullName;
    accountEmail.textContent = email;
    metaCreated.textContent = formatDate(createdAt);
    metaId.textContent = shortenId(user.id);
    avatar.textContent = getInitials(fullName, email);
    profileAvatar.textContent = getInitials(fullName, email);
    renderHeaderProfile(fullName, email, photoUrl);
    updateHeaderCartCount();

    showStatus('Your account is active and connected.', 'success');
    loadProfilePosts(user);
  }catch(error){
    console.error(error);
    showStatus('We could not load your account right now.', 'error');
  }
}

logoutButton.addEventListener('click', async function(){
  if(!window.supabase){
    showStatus('Supabase is not connected yet.', 'error');
    return;
  }

  logoutButton.disabled = true;
  logoutButton.textContent = 'Logging Out...';

  try{
    const { error } = await window.supabase.auth.signOut();

    if(error){
      showStatus(error.message, 'error');
      logoutButton.disabled = false;
      logoutButton.textContent = 'Log Out';
      return;
    }

    window.location.href = 'login.html';
  }catch(error){
    console.error(error);
    showStatus('Something went wrong while logging out.', 'error');
    logoutButton.disabled = false;
    logoutButton.textContent = 'Log Out';
  }
});

document.addEventListener('DOMContentLoaded', loadAccount);
