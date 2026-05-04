import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

// Initialize Stripe using your secret key from the .env file
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', 
});

export const POST: APIRoute = async ({ request, locals, redirect }) => {
    // 1. Security Check: Ensure the user is actually logged in
    if (!locals.user) {
        return redirect('/login');
    }

    try {
        // 2. Grab the tenant ID from the form submission
        const formData = await request.formData();
        const tenantId = formData.get('tenantId')?.toString();

        if (!tenantId) {
            return new Response("Missing tenant ID", { status: 400 });
        }

        // 3. Security Check: Verify this user actually owns this tenant in PocketBase!
        const tenant = await locals.pb.collection('tenants').getOne(tenantId);
        if (tenant.owner !== locals.user.id) {
            return new Response("Unauthorized to upgrade this tenant.", { status: 403 });
        }

        // Use your explicit production URL from .env, fallback to request origin for local testing
        const baseUrl = process.env.PUBLIC_SITE_URL || new URL(request.url).origin;
        // Figure out the base URL (e.g., http://localhost:4321 or https://jammetry.com)
        //const origin = new URL(request.url).origin;

        // 4. Create the Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    // 👉 MUST MATCH YOUR STRIPE DASHBOARD PRICE ID!
                    price: process.env.STRIPE_PRO_PRICE_ID, 
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            
            // Pre-fill their email on the Stripe page to save them time
            customer_email: locals.user.email, 
            
            // 👉 THE MAGIC LINK: This passes the tenant ID to Stripe, 
            // which hands it to your webhook after they pay!
            client_reference_id: tenantId, 
            
            // Where to send them after they pay (or if they click back)
            success_url: `${baseUrl}/dashboard/analytics?upgrade=success`,
            cancel_url: `${baseUrl}/dashboard/analytics?upgrade=cancelled`,
        });

        // 5. Instantly redirect the user's browser to the Stripe payment page
        if (session.url) {
            return redirect(session.url, 303);
        } else {
            throw new Error("Failed to create Stripe session URL");
        }

    } catch (error: any) {
        console.error("❌ Stripe Checkout Error:", error);
        // Fallback redirect if Stripe is down or keys are missing
        return redirect('/dashboard/analytics?upgrade=error', 303);
    }
};