import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
    // 1. Security Check
    if (!locals.user) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        const formData = await request.formData();
        const id = formData.get('id')?.toString();
        
        if (!id) return new Response("Missing ID", { status: 400 });

        // Compile the settings JSON object
        const settings = {
            bot_name: formData.get('bot_name')?.toString() || 'AI Assistant',
            theme_color: formData.get('theme_color')?.toString() || '#2563eb',
            welcome_message: formData.get('welcome_message')?.toString() || 'Hello! How can I help?',
            system_prompt: formData.get('system_prompt')?.toString() || 'You are a helpful assistant.'
        };

        // 2. Update PocketBase
        // Note: PocketBase's API rules will automatically block this if the user doesn't own the tenant!
        await locals.pb.collection('tenants').update(id, {
            name: formData.get('name')?.toString(),
            domain: formData.get('domain')?.toString(),
            settings: settings
        });

        // 3. Redirect back to the config page with a success message
        return new Response(null, {
            status: 303,
            headers: { "Location": `/dashboard/tenants/${id}?success=true` }
        });

    } catch (error: any) {
        console.error("Update failed:", error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
};