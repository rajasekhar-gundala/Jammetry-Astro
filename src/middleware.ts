import { defineMiddleware } from "astro:middleware";
import PocketBase from "pocketbase";

export const onRequest = defineMiddleware(async ({ locals, request, redirect, url }, next) => {
    const pb = new PocketBase("http://pocketbase:8080");
    
    // Read the RAW cookie header directly from the browser request
    pb.authStore.loadFromCookie(request.headers.get("cookie") || "");

    if (pb.authStore.isValid) {
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

    // 1. Kick out unauthenticated users
    if ((isAdminRoute || isDashboardRoute) && !locals.user) {
        return redirect("/login");
    }

    // 2. Prevent logged-in users from seeing login/signup pages
    if ((isLoginPage || isSignupPage) && locals.user) {
        return redirect("/dashboard/tenants");
    }

    // --- 3. UNIFIED SUPER-APP ROUTER GUARD ---
    if (isDashboardRoute && locals.user) {
        // Map URL paths to the required PocketBase module IDs
        const accessMap = [
            { path: '/dashboard/chat', requiredModule: 'chat' },
            { path: '/dashboard/extract', requiredModule: 'extract' },
            { path: '/dashboard/daas', requiredModule: 'daas' },
            { path: '/dashboard/knowledgebase', requiredModule: 'knowledgebase' },
            { path: '/dashboard/hosting', requiredModule: 'hosting' },
        ];

        // Get active modules, with backward compatibility for legacy 'app_context'
        let userModules = locals.user.active_modules || [];
        const legacyContext = locals.user.app_context || '';

        if (legacyContext === 'all-in-one') {
            userModules = ['chat', 'extract', 'daas', 'knowledgebase', 'hosting'];
        } else if (legacyContext === 'jammetry') {
            userModules = [...userModules, 'chat']; // Assuming old jammetry was chat
        } else if (legacyContext === 'daas') {
            userModules = [...userModules, 'daas', 'knowledgebase'];
        }

        // Check which module they are trying to access
        for (const route of accessMap) {
            if (url.pathname.startsWith(route.path)) {
                // If they don't have the module, block them and send to upgrade page!
                if (!userModules.includes(route.requiredModule)) {
                    console.log(`🔒 Blocked access to ${route.path}. User lacks '${route.requiredModule}' module.`);
                    return redirect(`/pricing?upgrade=${route.requiredModule}&reason=locked`);
                }
            }
        }
    }

    const response = await next();

    // Sync the cookie back to the browser to keep the session alive.
    if (pb.authStore.isValid) {
        response.headers.append('set-cookie', pb.authStore.exportToCookie({ 
            httpOnly: true, 
            secure: true, 
            sameSite: 'lax',
            path: '/' 
        }));
    }

    return response;
});