'use client'

import { Session } from "@supabase/supabase-js"
import { Crisp } from "crisp-sdk-web"
import posthog from "posthog-js"
import { useEffect } from "react"

export const PosthogMail = ({ session }: { session: Session }) => {
    useEffect(() => {
        if (!session?.user?.id) return
        posthog.identify(session.user.id, {
            email: session.user.email,
        })
        Crisp.user.setEmail(session.user.email!);
    }, [session])

    return null;
}


