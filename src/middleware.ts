import { defineMiddleware } from "astro:middleware";
import PocketBase from "pocketbase";

export const onRequest = defineMiddleware(async ({ locals, request, redirect, url }, next) => {
    // Use environment variable for PocketBase URL to prevent hardcoding issues across environments
    const pbUrl = process.env.PUBLIC_POCKETBASE_URL || "http://pocketbase:8080";
    const pb = new PocketBase(pbUrl);
    
    // Read the RAW cookie header
    pb.authStore.loadFromCookie(request.headers.get("cookie") || "");

    // 1. FRESHNESS CHECK: Did they just return from a Stripe checkout?
    const isUpgradeSuccess = url.searchParams.get('upgrade') === 'success';

    if (pb.authStore.isValid) {
        if (isUpgradeSuccess) {
            try {
                console.log("🔄 User returned from Stripe. Refreshing permissions...");
                // Give the Stripe Webhook 1.5 seconds to finish updating PocketBase in the background
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Force fetch the newly updated user record from the database!
                await pb.collection('users').authRefresh();
            } catch (e) {
                console.error("Failed to refresh user auth after upgrade", e);
            }
        }
        locals.user = pb.authStore.model; 
    } else {
        pb.authStore.clear();
        locals.user = null;
    }

    locals.pb = pb;

    const isAdminRoute = url.pathname.startsWith("/admin");
    const isDashboardRoute = url.pathname.startsWith("/dashboard");
    const isLoginPage = url.pathname === "/login";
    const isSignupPage = url.pathname === "/signup";

    // Kick out unauthenticated users
    if ((isAdminRoute || isDashboardRoute) && !locals.user) {
        return redirect("/login");
    }

    // Prevent logged-in users from seeing login/signup pages
    if ((isLoginPage || isSignupPage) && locals.user) {
        const modules = locals.user.active_modules || [];
        const legacy = locals.user.app_context || '';
        
        if (modules.includes('extract') || legacy === 'pdf-extract') return redirect('/dashboard/extract');
        if (modules.includes('chat') || legacy === 'docs-chat') return redirect('/dashboard/chat');
        
        return redirect("/dashboard/tenants");
    }

    // --- UNIFIED SUPER-APP ROUTER GUARD ---
    if (isDashboardRoute && locals.user) {
        const accessMap = [
            { path: '/dashboard/chat', requiredModule: 'chat' },
            { path: '/dashboard/extract', requiredModule: 'extract' },
            { path: '/dashboard/daas', requiredModule: 'daas' },
            { path: '/dashboard/knowledgebase', requiredModule: 'knowledgebase' },
            { path: '/dashboard/hosting', requiredModule: 'hosting' },
        ];

        let userModules = locals.user.active_modules || [];
        const legacyContext = locals.user.app_context || '';

        // Backward compatibility mappings
        if (legacyContext === 'all-in-one') {
            userModules = ['chat', 'extract', 'daas', 'knowledgebase', 'hosting'];
        } else if (legacyContext === 'jammetry' || legacyContext === 'docs-chat') {
            userModules = [...userModules, 'chat']; 
        } else if (legacyContext === 'pdf-extract') {
            userModules = [...userModules, 'extract'];
        } else if (legacyContext === 'daas') {
            userModules = [...userModules, 'daas', 'knowledgebase'];
        }

        for (const route of accessMap) {
            if (url.pathname.startsWith(route.path)) {
                if (!userModules.includes(route.requiredModule)) {
                    console.log(`🔒 Blocked access to ${route.path}. User lacks '${route.requiredModule}'.`);
                    return redirect(`/pricing?upgrade=${route.requiredModule}&reason=locked`);
                }
            }
        }
    }

    const response = await next();

    // Sync the cookie back to the browser.
    // If we just did an authRefresh, this automatically saves the new permissions to their browser!
    if (pb.authStore.isValid) {
        response.headers.append('set-cookie', pb.authStore.exportToCookie({ 
            httpOnly: true, 
            secure: true, 
            sameSite: 'lax',
            path: '/' 
        }));
        
        // If they just upgraded, cleanly redirect them to the same page without the ?upgrade=success 
        // parameter so they don't trigger the 1.5s delay if they manually refresh the page later.
        if (isUpgradeSuccess) {
            return redirect(url.pathname);
        }
    }

    return response;
});