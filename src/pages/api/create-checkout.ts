// src/pages/api/create-checkout.ts
import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

// Initialize Stripe using your secret key from the .env file
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', 
});

export const GET: APIRoute = async ({ locals, redirect, url }) => {
    // 1. Security Check: Ensure the user is actually logged in
    if (!locals.user) {
        return redirect('/login');
    }

    try {
        // 2. Grab the module they want to buy from the URL (e.g., ?module=doc_pro)
        const targetModule = url.searchParams.get('module');

        // 👇 IMPROVEMENT: If the link is broken or missing a module, send them to pricing!
        if (!targetModule) {
            console.warn("⚠️ Missing module selection in checkout link");
            return redirect('/pricing?error=missing_module', 303);
        }

        // 3. Map the requested module to your Stripe Price IDs
        const priceIds: Record<string, string | undefined> = {
            'doc_pro': process.env.STRIPE_PRICE_DOC_PRO,
            'daas': process.env.STRIPE_PRICE_DAAS,
            'knowledgebase': process.env.STRIPE_PRICE_KNOWLEDGEBASE,
            'hosting': process.env.STRIPE_PRICE_HOSTING,
            'all-in-one': process.env.STRIPE_PRICE_ALL_IN_ONE,
        };

        const priceId = priceIds[targetModule];

        if (!priceId) {
            console.error(`Missing Stripe Price ID for module: ${targetModule}`);
            return redirect('/pricing?error=missing_price', 303);
        }

        const baseUrl = process.env.PUBLIC_SITE_URL || url.origin;

        // 4. Smart Redirect Logic
        let successPath = 'tenants'; 
        if (targetModule === 'doc_pro' || targetModule === 'chat') successPath = 'chat';
        if (targetModule === 'extract') successPath = 'extract';

        // 5. Create the Stripe Checkout Session
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
            client_reference_id: locals.user.id, 
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
            success_url: `${baseUrl}/dashboard/${successPath}?upgrade=success`,
            cancel_url: `${baseUrl}/pricing?upgrade=cancelled`,
        });

        // 6. Instantly redirect the user's browser to the Stripe payment page
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