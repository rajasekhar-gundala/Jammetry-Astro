import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

// Initialize Stripe using your secret key from the .env file
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', 
});

// 👉 Changed from POST to GET to support the <a> tags on the pricing page
export const GET: APIRoute = async ({ locals, redirect, url }) => {
    // 1. Security Check: Ensure the user is actually logged in
    if (!locals.user) {
        return redirect('/login');
    }

    try {
        // 2. Grab the module they want to buy from the URL (e.g., ?module=extract)
        const targetModule = url.searchParams.get('module');

        if (!targetModule) {
            return new Response("Missing module selection", { status: 400 });
        }

        // 3. Map the requested module to your Stripe Price IDs
        // ⚠️ Make sure to add these exact variable names to your Docker/Render .env file!
        const priceIds: Record<string, string | undefined> = {
            'chat': process.env.STRIPE_PRICE_CHAT,
            'daas': process.env.STRIPE_PRICE_DAAS,
            'extract': process.env.STRIPE_PRICE_EXTRACT,
            'all-in-one': process.env.STRIPE_PRICE_ALL_IN_ONE,
        };

        const priceId = priceIds[targetModule];

        if (!priceId) {
            console.error(`Missing Stripe Price ID for module: ${targetModule}`);
            return redirect('/pricing?error=missing_price', 303);
        }

        // Use your explicit production URL from .env, fallback to request origin for local testing
        const baseUrl = process.env.PUBLIC_SITE_URL || url.origin;

        // 4. Create the Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId, 
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            customer_email: locals.user.email, 
            
            // 👉 THE MAGIC LINK: We now pass the USER ID instead of the Tenant ID, 
            // because modules belong to the User's account globally!
            client_reference_id: locals.user.id, 
            
            // 👉 Pass the specific module in metadata so the webhook knows exactly what to unlock
            metadata: {
                module: targetModule,
                userId: locals.user.id
            },
            subscription_data: {
                metadata: {
                    module: targetModule,
                    userId: locals.user.id
                }
            },
            
            // Smart Redirect: Send them directly to the app they just bought!
            success_url: `${baseUrl}/dashboard/${targetModule === 'all-in-one' ? 'tenants' : targetModule}?upgrade=success`,
            cancel_url: `${baseUrl}/pricing?upgrade=cancelled`,
        });

        // 5. Instantly redirect the user's browser to the Stripe payment page
        if (session.url) {
            return redirect(session.url, 303);
        } else {
            throw new Error("Failed to create Stripe session URL");
        }

    } catch (error: any) {
        console.error("❌ Stripe Checkout Error:", error);
        return redirect('/pricing?error=stripe_failure', 303);
    }
};