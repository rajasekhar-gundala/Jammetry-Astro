import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export const POST: APIRoute = async ({ request, locals }) => {
    const pb = new PocketBase("http://pocketbase:8080");

    try {
        const formData = await request.formData();
        const name = formData.get('name')?.toString()?.trim();
        let domain = formData.get('domain')?.toString()?.trim();
        let email = formData.get('email')?.toString()?.trim().toLowerCase();

        // Fallback to logged-in user's email if none provided
        if (!email && locals.user) email = locals.user.email;

        if (!name || !domain || !email) {
            return new Response(JSON.stringify({ error: "Missing fields." }), { status: 400 });
        }

        // ==========================================
        // 1. STRICT DOMAIN FORMAT VALIDATION
        // ==========================================
        if (!/^https?:\/\//i.test(domain)) {
            domain = 'https://' + domain;
        }
        
        // Regex ensures it has a proper TLD (like .com, .net, .xyz)
        const domainRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/;
        if (!domainRegex.test(domain)) {
            return new Response(JSON.stringify({ 
                error: "Invalid website format. Please include a proper extension like .com or .net." 
            }), { status: 400 });
        }

        const adminEmail = process.env.PB_ADMIN_EMAIL;
        const adminPass = process.env.PB_ADMIN_PASSWORD;

        // Authenticate as Admin to query and create records safely
        await pb.collection('_superusers').authWithPassword(adminEmail!, adminPass!);

        // ==========================================
        // 2. CHECK FOR DUPLICATE DOMAIN
        // ==========================================
        try {
            const existingDomain = await pb.collection('tenants').getFirstListItem(`domain="${domain}"`);
            if (existingDomain) {
                return new Response(JSON.stringify({ 
                    error: "This website URL is already registered in our system." 
                }), { status: 400 });
            }
        } catch (e) {
            // PocketBase throws 404 if NOT found. This means the domain is unique! Proceed.
        }

        // ==========================================
        // 3. USER CREATION & DUPLICATE EMAIL CHECK
        // ==========================================
        let userId: string;
        let isNewUser = false;
        const setupToken = crypto.randomBytes(32).toString('hex'); 

        // If the user is actively logged in and using their own email, let them create a new tenant
        if (locals.user && locals.user.email === email) {
            userId = locals.user.id;
        } else {
            // They are NOT logged in. Check if the email exists.
            try {
                const existingUser = await pb.collection('users').getFirstListItem(`email="${email}"`);
                
                // SECURITY FIX: If we find a user, we CANNOT let an unauthenticated person 
                // create a tenant on their behalf. We must block them and tell them to log in.
                if (existingUser) {
                    return new Response(JSON.stringify({ 
                        error: "An account with this email address already exists. Please log in to add more assistants." 
                    }), { status: 400 });
                }
            } catch (e) {
                // User does NOT exist. Safe to create a new one.
                const tempPassword = crypto.randomBytes(16).toString('hex') + "A1!";
                const newUser = await pb.collection('users').create({
                    email: email,
                    password: tempPassword,
                    passwordConfirm: tempPassword,
                    name: "",
                    emailVisibility: true,
                    verified: false,
                    // 👇 FIXED: Initialize with modular framework instead of legacy jammetry
                    plan_type: "free",
                    app_context: "base",
                    active_modules: [], 
                    setup_token: setupToken // Saving our custom token
                });
                userId = newUser.id;
                isNewUser = true; 
            }
        }

        // ==========================================
        // 4. CREATE TENANT & SEND EMAIL
        // ==========================================
        const newTenant = await pb.collection('tenants').create({
            name: name,
            domain: domain,
            active: true,
            owner: userId,
            contact_email: email,
            settings: { theme_color: "#2563eb", bot_name: "AI Assistant" }
        });

        if (isNewUser) {
            // Send Email via Nodemailer
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || "smtp.gmail.com",
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            const verifyUrl = `https://jammetry.com/verify-setup?token=${setupToken}`;

            const htmlContent = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h2>Welcome to Jammetry AI!</h2>
                    <p>Your AI assistant workspace for <strong>${name}</strong> is ready.</p>
                    <p>Click the button below to verify your email address and set your password.</p>
                    <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px;">Verify & Set Password</a>
                </div>
            `;

            await transporter.sendMail({
                from: `"Jammetry AI" <${process.env.SMTP_USER}>`,
                to: email,
                subject: "Verify your email to access Jammetry AI",
                html: htmlContent,
            });

            return new Response(JSON.stringify({ 
                success: true, 
                redirectUrl: `/signup-success?id=${newTenant.id}&email=${email}` 
            }), { status: 200 });
        } else {
            // User was already logged in, redirect them back to their dashboard
            return new Response(JSON.stringify({ 
                success: true, 
                redirectUrl: `/dashboard/tenants` 
            }), { status: 200 });
        }

    } catch (error: any) {
        console.error("🔥 PB Error:", error.message);
        
        // Ensure we always return a clean string to the frontend
        const errorMessage = error?.response?.message || error.message || "Failed to process request.";
        return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
    }
};