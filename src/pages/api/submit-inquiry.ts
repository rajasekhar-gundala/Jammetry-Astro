import type { APIRoute } from 'astro';
import PocketBase from 'pocketbase';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const formData = await request.formData();
        const name = formData.get('name')?.toString();
        const email = formData.get('email')?.toString();
        const subject = formData.get('subject')?.toString();
        const message = formData.get('message')?.toString();

        if (!name || !email || !message) {
            return new Response("Missing required fields", { status: 400 });
        }

        const pb = new PocketBase(process.env.PB_URL || "http://pocketbase:8080");
        const adminEmail = process.env.PB_ADMIN_EMAIL;
        const adminPass = process.env.PB_ADMIN_PASSWORD;

        // Authenticate as platform owner to write to the secure collection
        if (adminEmail && adminPass) {
            await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
        }

        // Save the lead to your new database collection!
        await pb.collection('platform_inquiries').create({
            name,
            email,
            subject: subject || "General Inquiry",
            message,
            is_resolved: false
        });

        // Send them back to the contact page with a success message
        return redirect('/contact?success=true', 303);

    } catch (error: any) {
        console.error("❌ Inquiry Error:", error.message);
        return redirect('/contact?error=true', 303);
    }
};