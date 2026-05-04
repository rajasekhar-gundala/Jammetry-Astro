import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import PocketBase from 'pocketbase';

export const prerender = false;

// Initialize Stripe (ensure STRIPE_SECRET_KEY is in your .env or Docker config)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', // Use the latest API version
});

export const POST: APIRoute = async ({ request }) => {
    // 1. Grab the signature Stripe sends in the headers
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return new Response("Missing Stripe configuration.", { status: 400 });
    }

    let event;

    try {
        // 2. Stripe requires the raw text body to verify the cryptographic signature
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
        console.error(`❌ Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // 3. Handle the successful payment event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // When you create the checkout session, you must pass the tenant.id 
        // into Stripe's "client_reference_id" field so it gets passed back here!
        const tenantId = session.client_reference_id;

        if (tenantId) {
            try {
                // 4. Authenticate with PocketBase as a Superuser
                const pb = new PocketBase(process.env.PB_URL || "http://pocketbase:8080");
                const adminEmail = process.env.PB_ADMIN_EMAIL;
                const adminPass = process.env.PB_ADMIN_PASSWORD;

                if (adminEmail && adminPass) {
                    await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
                }

                // 5. Upgrade the Tenant!
                await pb.collection('tenants').update(tenantId, {
                    plan_type: "pro",
                    stripe_customer_id: session.customer as string
                });
                
                console.log(`✅ Successfully upgraded tenant ${tenantId} to PRO!`);
            } catch (pbError) {
                console.error("❌ Failed to update PocketBase:", pbError);
                // Return 500 so Stripe knows the database failed and retries the webhook later
                return new Response("Database update failed", { status: 500 });
            }
        } else {
            console.warn("⚠️ Webhook received, but no client_reference_id (tenant ID) was found.");
        }
    }

    // 6. Tell Stripe we received the event successfully
    return new Response(JSON.stringify({ received: true }), { status: 200 });
};