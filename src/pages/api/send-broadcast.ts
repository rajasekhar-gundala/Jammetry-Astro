import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';
import nodemailer from 'nodemailer';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const formData = await request.formData();
        const subject = formData.get('subject')?.toString();
        const message = formData.get('message')?.toString();

        if (!subject || !message) {
            return redirect('/admin/broadcast?error=Missing+fields', 303);
        }

        // 1. Authenticate with PocketBase as Super Admin
        const pb = new PocketBase(process.env.PB_URL || "http://pocketbase:8080");
        const adminEmail = process.env.PB_ADMIN_EMAIL;
        const adminPass = process.env.PB_ADMIN_PASSWORD;

        if (adminEmail && adminPass) {
            await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
        } else {
            throw new Error("Missing Super Admin credentials");
        }

        // 2. Fetch ALL registered users to get their emails
        const users = await pb.collection('users').getFullList({
            fields: 'email' // We only need the email field!
        });
        
        // Extract just the email strings into an array
        const emailList = users.map(u => u.email).filter(Boolean);

        if (emailList.length === 0) {
            return redirect('/admin/broadcast?error=No+users+found', 303);
        }

        // 3. Connect to your Gmail via Nodemailer
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: true, // Use SSL
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // 4. Send the Email Blast!
        await transporter.sendMail({
            from: `"Jammetry AI" <${process.env.SMTP_USER}>`,
            bcc: emailList, // BCC ensures users don't see each other's emails!
            subject: subject,
            // Convert standard line breaks to HTML so it looks nice in their inbox
            html: message.replace(/\n/g, '<br>') 
        });

        // 5. Success! Route them back with a nice message.
        return redirect(`/admin/broadcast?success=true&count=${emailList.length}`, 303);

    } catch (error: any) {
        console.error("❌ Broadcast Error:", error.message);
        return redirect('/admin/broadcast?error=Failed+to+send+broadcast', 303);
    }
};