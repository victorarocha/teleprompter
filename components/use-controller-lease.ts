"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useShow, type ControllerHolder } from "@/components/use-show"

const ID_KEY = "teleprompter-controller-id"
const EPOCH_KEY = "teleprompter-controller-epoch"
const HEARTBEAT_MS = 4_000
const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export type ControllerLease = "checking" | "active" | "occupied" | "inactive" | "displaced"

type ClaimResponse = {
  status?: "active" | "occupied"
  leaseVersion?: number
}

type ControllerCommand = {
  id: string
  action: "claim" | "heartbeat" | "release"
  force?: boolean
  epoch?: number
}

let cachedControllerId: string | null = null

function clientControllerId(): string {
  if (cachedControllerId) return cachedControllerId
  const existing = sessionStorage.getItem(ID_KEY)
  const id = existing && ID_PATTERN.test(existing) ? existing : crypto.randomUUID()
  sessionStorage.setItem(ID_KEY, id)
  cachedControllerId = id
  return id
}

function currentEpoch(): number {
  const current = Number(sessionStorage.getItem(EPOCH_KEY) ?? "0")
  return Number.isInteger(current) && current > 0 ? current : 0
}

function nextEpoch(): number {
  const epoch = currentEpoch() + 1
  sessionStorage.setItem(EPOCH_KEY, String(epoch))
  return epoch
}

function postController(body: ControllerCommand): Promise<Response> {
  return fetch("/api/controller", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: body.action === "release",
  })
}

export function useControllerLease() {
  const [id, setId] = useState<string | null>(null)
  const [lease, setLease] = useState<ControllerLease>("checking")
  const [replaced, setReplaced] = useState(false)
  const [claimUnauthorized, setClaimUnauthorized] = useState(false)
  const leaseRef = useRef(lease)
  const idRef = useRef(id)
  const ackedRef = useRef(0)

  const commitLease = useCallback((next: ControllerLease) => {
    leaseRef.current = next
    setLease(next)
  }, [])

  const markDisplaced = useCallback(() => {
    if (leaseRef.current !== "active") return
    leaseRef.current = "displaced"
    setLease("displaced")
  }, [])

  const onHolder = useCallback((holder: ControllerHolder) => {
    if (holder.version <= ackedRef.current || holder.id === idRef.current) return
    if (holder.id != null) setReplaced(true)
    if (leaseRef.current !== "active") return
    leaseRef.current = "displaced"
    setLease("displaced")
  }, [])

  const { show, connected, unauthorized, now, send } = useShow({
    controllerId: lease === "active" ? id : null,
    onDisplaced: markDisplaced,
    onHolder,
  })

  const claim = useCallback(
    async (force: boolean) => {
      const controllerId = idRef.current
      if (!controllerId) return
      const epoch = nextEpoch()
      let response: Response
      try {
        response = await postController({
          id: controllerId,
          action: "claim",
          force,
          epoch,
        })
      } catch {
        if (currentEpoch() === epoch) commitLease("inactive")
        return
      }
      if (currentEpoch() !== epoch) return
      if (response.status === 401) {
        setClaimUnauthorized(true)
        commitLease("inactive")
        return
      }
      if (!response.ok) {
        commitLease("inactive")
        return
      }
      let data: ClaimResponse
      try {
        data = (await response.json()) as ClaimResponse
      } catch {
        if (currentEpoch() === epoch) commitLease("inactive")
        return
      }
      if (currentEpoch() !== epoch) return
      if (data.status === "active") {
        ackedRef.current = typeof data.leaseVersion === "number" ? data.leaseVersion : 0
        setReplaced(false)
        commitLease("active")
        return
      }
      if (data.status === "occupied") {
        commitLease("occupied")
        return
      }
      commitLease("inactive")
    },
    [commitLease],
  )

  useEffect(() => {
    const timer = setTimeout(() => setId(clientControllerId()), 0)
    return () => clearTimeout(timer)
  }, [])

  const commitLeaseRef = useRef(commitLease)
  const claimRef = useRef(claim)
  useEffect(() => {
    commitLeaseRef.current = commitLease
    claimRef.current = claim
  }, [claim, commitLease])

  useEffect(() => {
    idRef.current = id
  }, [id])

  useEffect(() => {
    if (!id) return
    const epoch = nextEpoch()
    let ignore = false
    void postController({ id, action: "claim", force: false, epoch })
      .then(async (response) => {
        if (ignore || currentEpoch() !== epoch) return
        if (response.status === 401) {
          setClaimUnauthorized(true)
          commitLeaseRef.current("inactive")
          return
        }
        if (!response.ok) {
          commitLeaseRef.current("inactive")
          return
        }
        const data = (await response.json()) as ClaimResponse
        if (ignore || currentEpoch() !== epoch) return
        if (data.status === "active") {
          ackedRef.current = typeof data.leaseVersion === "number" ? data.leaseVersion : 0
          setReplaced(false)
          commitLeaseRef.current("active")
          return
        }
        if (data.status === "occupied") {
          commitLeaseRef.current("occupied")
          return
        }
        commitLeaseRef.current("inactive")
      })
      .catch(() => {
        if (ignore || currentEpoch() !== epoch) return
        commitLeaseRef.current("inactive")
      })
    return () => {
      ignore = true
    }
  }, [id])

  useEffect(() => {
    if (lease !== "active" || !id) return
    const beat = () => {
      void postController({ id, action: "heartbeat" })
        .then((response) => {
          if (response.status === 409) markDisplaced()
          if (response.status === 401) setClaimUnauthorized(true)
        })
        .catch(() => {
          // The next heartbeat retries. The lease expires if they all fail.
        })
    }
    const timer = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [id, lease, markDisplaced])

  useEffect(() => {
    if (!id) return
    const release = () => {
      if (leaseRef.current !== "active") return
      leaseRef.current = "checking"
      setLease("checking")
      void postController({
        id,
        action: "release",
        epoch: currentEpoch(),
      }).catch(() => {
        // A missed release expires with the lease.
      })
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      void claimRef.current(false)
    }
    window.addEventListener("pagehide", release)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.removeEventListener("pagehide", release)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [id])

  const requestTakeover = useCallback(() => {
    void claim(false)
  }, [claim])

  const confirmTakeover = useCallback(() => {
    void claim(true)
  }, [claim])

  const cancelTakeover = useCallback(() => {
    commitLease("inactive")
  }, [commitLease])

  return {
    lease,
    replaced,
    show,
    connected,
    unauthorized: unauthorized || claimUnauthorized,
    now,
    send,
    requestTakeover,
    confirmTakeover,
    cancelTakeover,
  }
}
