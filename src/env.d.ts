/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        pb: import('pocketbase').default;
        user: import('pocketbase').RecordModel | import('pocketbase').AdminModel | null;
    }
}