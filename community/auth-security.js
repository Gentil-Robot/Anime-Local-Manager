'use strict';
// Shared by the local engine and the web bundle. Secrets stay in the Auth SDK
// and in the enrollment dialog only; no password, TOTP key or JWT is returned
// by status, written to a diagnostic or saved as a profile preference.
function createAuthSecurity(client, {check, changed = () => {}, now = Date.now} = {}) {
  let queue = Promise.resolve(), pendingLogin = null, enrollment = null;
  const supported = () => !!client?.auth?.mfa;
  const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
  const failure = code => {throw Error(code);};
  const checked = result => {
    const value = check(result);
    if (value?.ok === false) failure(value.code || 'INVALID_INPUT');
    return value;
  };
  const rpc = async (name, args = {}) => checked(await client.rpc(name, args));
  const locked = task => {
    const work = queue.then(task);
    queue = work.catch(() => {});
    return work;
  };
  const session = async () => checked(await client.auth.getSession())?.session || null;
  // This identifier is used for local race protection, never authorization.
  const sessionKey = value => {
    try {
      const part=value.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const id=JSON.parse(globalThis.atob(part)).session_id;
      if(uuid(id))return id;
    } catch { /* Injected clients may use fictional opaque tokens. */ }
    return value?.refresh_token || value?.access_token || null;
  };
  function cleanState(raw) {
    if (raw?.version !== 1 || !Array.isArray(raw.factors)) failure('ALM_SECURITY_UPDATE_REQUIRED');
    const factors=raw.factors.filter(f=>uuid(f.id)).map(f=>({id:f.id,name:String(f.name||'Authenticator').slice(0,80),type:f.type}));
    return {
      available: true, enabled: raw.enabled === true, required: raw.required === true,
      locked: raw.locked === true, currentLevel: raw.currentLevel === 'aal2' ? 'aal2' : 'aal1',
      factors, backupReady: factors.length >= 2
    };
  }
  async function state() {
    const current = client ? await session() : null;
    if (!current) return {available:supported(),enabled:false,required:false,factors:[],backupReady:false};
    // Old injected test clients may omit the native MFA API. The real pinned
    // SDK always has it; server RLS/RPC authorization does not depend on this.
    if (!supported()) return {available:false,enabled:false,required:false,factors:[],backupReady:false};
    let raw;
    try {raw=await rpc('alm_security_state');}
    catch(error){
      if(!/^(SESSION_EXPIRED|sessionExpired|ALM_COMMUNITY_LOGIN_REQUIRED)$/.test(String(error.message)))throw error;
      try{await client.auth.signOut({scope:'local'});}finally{pendingLogin=null;enrollment=null;changed();}
      return {available:true,enabled:false,required:false,factors:[],backupReady:false,revoked:true};
    }
    const result = cleanState(raw);
    if (result.required) {
      if (!pendingLogin || pendingLogin.user !== current.user.id || pendingLogin.session!==sessionKey(current)) pendingLogin = {id:globalThis.crypto.randomUUID(),user:current.user.id,session:sessionKey(current)};
      result.attemptId = pendingLogin.id;
    }
    return result;
  }
  async function afterLogin(result) {
    enrollment = null;pendingLogin = null;changed();
    if (!result.connected) return result;
    const mfa = await state();
    const current=await session();
    if (mfa.revoked || !current) failure('SESSION_EXPIRED');
    if (!pendingLogin && current) pendingLogin={id:globalThis.crypto.randomUUID(),user:current.user.id,session:sessionKey(current)};
    return {...result,connected:!mfa.required,mfaRequired:mfa.required,mfa,authAttemptId:pendingLogin?.id};
  }
  async function code(factorId, value) {
    if (!supported()) failure('ALM_SECURITY_UPDATE_REQUIRED');
    if (!uuid(factorId) || !/^\d{6}$/.test(String(value||''))) failure('MFA_CODE_INVALID');
    checked(await client.auth.mfa.challengeAndVerify({factorId,code:String(value)}));changed();
  }
  async function revokeCurrent() {
    try {await rpc('alm_logout_session');}
    catch (error) {
      if (!/SESSION_EXPIRED|session_not_found/.test(String(error.message))) throw error;
    }
  }
  async function logoutInternal() {
    let failure;
    try {if (supported() && await session()) await revokeCurrent();} catch(error) {failure=error;}
    try {checked(await client.auth.signOut({scope:'local'}));}
    catch(error) {if (!/SESSION_EXPIRED|session_not_found|sessionExpired/.test(String(error.message))) failure ||= error;}
    finally {pendingLogin=null;enrollment=null;changed();}
    if (failure) throw failure;
    return {ok:true};
  }
  async function prove(action, target, input) {
    if (!supported()) failure('ALM_SECURITY_UPDATE_REQUIRED');
    if (typeof input?.password !== 'string' || !input.password || input.password.length > 128) failure('INVALID_INPUT');
    const previous = await session();
    const owner = checked(await client.auth.getUser())?.user;
    if (!previous || !owner || owner.id !== previous.user.id || !owner.email) failure('SESSION_EXPIRED');
    const challenge = await rpc('alm_begin_sensitive',{p_action:action,p_target:target||null});
    if (!uuid(challenge?.id)) failure('ALM_SECURITY_UPDATE_REQUIRED');
    let signedIn = false, approved = false;
    try {
      const fresh = checked(await client.auth.signInWithPassword({email:owner.email,password:input.password,options:{captchaToken:input.captchaToken}}));
      signedIn = true;changed();
      if (!fresh?.session || fresh.user?.id !== owner.id) failure('SESSION_EXPIRED');
      const mfa = await state();
      if (mfa.enabled) {
        if (!mfa.factors.some(f=>f.id===input.factorId)) failure('MFA_REQUIRED');
        await code(input.factorId,input.code);
      }
      await rpc('alm_approve_sensitive',{p_authorization:challenge.id});
      approved = true;pendingLogin=null;
      return {ok:true};
    } finally {
      // An invalid second factor must not strand the UI in the replacement
      // AAL1 session. Revoke that failed login and restore the previous one.
      if (signedIn && !approved) {
        try {await revokeCurrent();} catch { /* Original error remains visible. */ }
        try {checked(await client.auth.setSession({access_token:previous.access_token,refresh_token:previous.refresh_token}));}
        catch {try {await client.auth.signOut({scope:'local'});} catch { /* No success is reported. */ }}
        pendingLogin=null;changed();
      }
    }
  }
  return {
    supported, state,
    afterLogin,
    authenticate: login => locked(async()=>afterLogin(await login())),
    authorize: (action,target,input) => locked(()=>prove(action,target,input)),
    // Keep the fresh proof and its one-use RPC together. A queued logout or
    // password login must not replace the session between these two steps.
    executeAuthorized: (action,target,input,execute) => locked(async()=>{
      await prove(action,target,input);
      return execute();
    }),
    verifyLogin: input => locked(async()=>{
      const mfa=await state();
      if (!pendingLogin || input.attemptId!==pendingLogin.id || !mfa.required
          || !mfa.factors.some(f=>f.id===input.factorId)) failure('MFA_REQUIRED');
      await code(input.factorId,input.code);
      const next=await state();if(next.revoked)failure('SESSION_EXPIRED');if(next.required)failure('MFA_REQUIRED');
      // Keep the attempt until the UI has accepted the result. A close while
      // verification was in flight can still cancel this exact login.
      return {ok:true,mfa:next};
    }),
    cancelLogin: input => locked(async()=>{
      const current=await session();
      if (pendingLogin && input?.attemptId===pendingLogin.id && current?.user.id===pendingLogin.user && sessionKey(current)===pendingLogin.session) return logoutInternal();
      return {ok:true};
    }),
    enroll: input => locked(async()=>{
      if (enrollment) failure('MFA_ENROLLMENT_PENDING');
      await prove('mfa-enroll',null,input);
      const data=checked(await client.auth.mfa.enroll({factorType:'totp',issuer:'Anime Local Manager',friendlyName:String(input.name||'Authenticator').trim().slice(0,80)}));
      if (!uuid(data?.id) || typeof data.totp?.uri!=='string' || !data.totp.uri.startsWith('otpauth://totp/')
          || !/^[A-Z2-7]{16,256}$/i.test(String(data.totp?.secret||''))) failure('MFA_ENROLLMENT_FAILED');
      const current=await session();
      enrollment={id:data.id,user:current?.user.id,session:sessionKey(current),expires:now()+4*60*1000};
      return {id:data.id,uri:data.totp.uri,secret:data.totp.secret};
    }),
    verifyEnrollment: input => locked(async()=>{
      const current=await session();
      if (!enrollment || enrollment.id!==input.factorId || current?.user.id!==enrollment.user || sessionKey(current)!==enrollment.session
          || enrollment.expires<=now()) failure('REAUTH_REQUIRED');
      await code(input.factorId,input.code);
      const mfa=cleanState(await rpc('alm_confirm_mfa_enrollment',{p_factor:input.factorId}));
      enrollment=null;pendingLogin=null;changed();return {ok:true,mfa};
    }),
    cancelEnrollment: input => locked(async()=>{
      const current=await session();
      if (enrollment && enrollment.id===input?.factorId && enrollment.user===current?.user.id && enrollment.session===sessionKey(current)) {
        const id=enrollment.id;enrollment=null;
        // No registered factor can be removed through this cancellation path.
        const trusted=await state();
        if (!trusted.factors.some(f=>f.id===id)) checked(await client.auth.mfa.unenroll({factorId:id}));
        changed();
      }
      return {ok:true};
    }),
    changeFactor: input => locked(async()=>{
      const action=input.action==='remove'?'mfa-remove':input.action==='disable'?'mfa-disable':failure('INVALID_INPUT');
      const target=action==='mfa-remove'?input.target:null;
      if (target!==null&&!uuid(target)) failure('INVALID_INPUT');
      await prove(action,target,input);
      await rpc('alm_authorize_factor_change',{p_action:action,p_factor:target});
      const factors=checked(await client.auth.mfa.listFactors());
      // Native unenrollment downgrades sessions that used this factor. Remove
      // the factor just used for the fresh proof last, so earlier removals do
      // not drop this session to AAL1 halfway through a full disable.
      const selected=action==='mfa-remove'?[target]:(factors.all||factors.totp||[]).map(f=>f.id)
        .sort((a,b)=>Number(a===input.factorId)-Number(b===input.factorId));
      for (const id of selected) checked(await client.auth.mfa.unenroll({factorId:id}));
      await rpc('alm_finish_factor_change',{p_action:action,p_factor:target});
      checked(await client.auth.refreshSession());changed();pendingLogin=null;
      return {ok:true,mfa:await state()};
    }),
    logout: () => locked(logoutInternal)
  };
}
module.exports={createAuthSecurity};
