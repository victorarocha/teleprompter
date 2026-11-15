"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import useSWR from "swr"
import useSWRMutation from "swr/mutation"

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

type ClaimKey = readonly ["controller-claim", string, number, boolean]
type HeartbeatKey = readonly ["controller-heartbeat", string, number]
type ReleaseKey = readonly ["controller-release", string]

type ClaimOutcome = {
  epoch: number
  kind: "active" | "occupied" | "inactive" | "unauthorized" | "stale"
  leaseVersion: number
}

type ClaimTicket = {
  force: boolean
  n: number
}

type HeartbeatResult = {
  status: number
  serial: number
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

async function fetchClaim(key: ClaimKey): Promise<ClaimOutcome> {
  const [, id, , force] = key
  const epoch = nextEpoch()
  try {
    const response = await postController({
      id,
      action: "claim",
      force,
      epoch,
    })
    if (currentEpoch() !== epoch) return { epoch, kind: "stale", leaseVersion: 0 }
    if (response.status === 401) return { epoch, kind: "unauthorized", leaseVersion: 0 }
    if (!response.ok) return { epoch, kind: "inactive", leaseVersion: 0 }
    const data = (await response.json()) as ClaimResponse
    if (currentEpoch() !== epoch) return { epoch, kind: "stale", leaseVersion: 0 }
    if (data.status === "active") {
      return {
        epoch,
        kind: "active",
        leaseVersion: typeof data.leaseVersion === "number" ? data.leaseVersion : 0,
      }
    }
    if (data.status === "occupied") return { epoch, kind: "occupied", leaseVersion: 0 }
    return { epoch, kind: "inactive", leaseVersion: 0 }
  } catch {
    if (currentEpoch() !== epoch) return { epoch, kind: "stale", leaseVersion: 0 }
    return { epoch, kind: "inactive", leaseVersion: 0 }
  }
}

let heartbeatSerial = 0

async function fetchHeartbeat(key: HeartbeatKey): Promise<HeartbeatResult> {
  const serial = ++heartbeatSerial
  try {
    const response = await postController({ id: key[1], action: "heartbeat" })
    return { status: response.status, serial }
  } catch {
    return { status: 0, serial }
  }
}

function claimUpdate(outcome: ClaimOutcome): {
  lease: ControllerLease
  unauthorized: boolean
  acked: number
} | null {
  if (outcome.kind === "stale" || outcome.epoch !== currentEpoch()) return null
  if (outcome.kind === "unauthorized") {
    return { lease: "inactive", unauthorized: true, acked: 0 }
  }
  if (outcome.kind === "active") {
    return { lease: "active", unauthorized: false, acked: outcome.leaseVersion }
  }
  if (outcome.kind === "occupied") {
    return { lease: "occupied", unauthorized: false, acked: 0 }
  }
  return { lease: "inactive", unauthorized: false, acked: 0 }
}

function applyResolvedClaim(
  outcome: ClaimOutcome | undefined,
  appliedEpoch: number,
  setAppliedEpoch: (epoch: number) => void,
  setLease: (lease: ControllerLease) => void,
  setAcked: (acked: number) => void,
  setReplaced: (replaced: boolean) => void,
  setClaimUnauthorized: (unauthorized: boolean) => void,
) {
  if (!outcome || outcome.epoch === appliedEpoch) return
  const claimChange = claimUpdate(outcome)
  if (!claimChange) return
  setAppliedEpoch(outcome.epoch)
  setLease(claimChange.lease)
  if (outcome.kind === "active") {
    setAcked(claimChange.acked)
    setReplaced(false)
  }
  if (claimChange.unauthorized) setClaimUnauthorized(true)
}

function applyHeartbeat(
  beat: HeartbeatResult | undefined,
  seenHeartbeat: number,
  lease: ControllerLease,
  setSeenHeartbeat: (serial: number) => void,
  setLease: (lease: ControllerLease) => void,
  setClaimUnauthorized: (unauthorized: boolean) => void,
) {
  if (!beat || beat.serial === seenHeartbeat || lease !== "active") return
  if (beat.status !== 409 && beat.status !== 401) return
  setSeenHeartbeat(beat.serial)
  if (beat.status === 409) setLease("displaced")
  if (beat.status === 401) setClaimUnauthorized(true)
}

function displaceIfActive(
  leaseRef: { current: ControllerLease },
  setLease: (lease: ControllerLease) => void,
) {
  if (leaseRef.current !== "active") return
  leaseRef.current = "displaced"
  setLease("displaced")
}

function acceptHolder(
  holder: ControllerHolder,
  ackedRef: { current: number },
  idRef: { current: string | null },
  leaseRef: { current: ControllerLease },
  setReplaced: (replaced: boolean) => void,
  setLease: (lease: ControllerLease) => void,
) {
  if (holder.version <= ackedRef.current || holder.id === idRef.current) return
  if (holder.id != null) setReplaced(true)
  displaceIfActive(leaseRef, setLease)
}

function releaseActiveLease(
  leaseRef: { current: ControllerLease },
  setLease: (lease: ControllerLease) => void,
  release: (epoch: number) => Promise<unknown>,
) {
  if (leaseRef.current !== "active") return
  leaseRef.current = "checking"
  setLease("checking")
  void release(currentEpoch()).catch(() => {
    // A missed release expires with the lease.
  })
}

function reclaimPersistedPage(event: PageTransitionEvent, reclaim: () => void) {
  if (!event.persisted) return
  reclaim()
}

async function releaseControllerLease(key: ReleaseKey, { arg: epoch }: { arg: number }) {
  try {
    await postController({
      id: key[1],
      action: "release",
      epoch,
    })
  } catch {
    // A missed release expires with the lease.
  }
}

export function useControllerLease() {
  const [id, setId] = useState<string | null>(null)
  const [lease, setLease] = useState<ControllerLease>("checking")
  const [replaced, setReplaced] = useState(false)
  const [claimUnauthorized, setClaimUnauthorized] = useState(false)
  const [claimTicket, setClaimTicket] = useState<ClaimTicket>({ force: false, n: 0 })
  const [appliedEpoch, setAppliedEpoch] = useState(0)
  const [acked, setAcked] = useState(0)
  const [seenHeartbeat, setSeenHeartbeat] = useState(0)
  const leaseRef = useRef(lease)
  const idRef = useRef(id)
  const ackedRef = useRef(0)

  const commitLease = useCallback((next: ControllerLease) => {
    leaseRef.current = next
    setLease(next)
  }, [])

  const markDisplaced = useCallback(() => {
    displaceIfActive(leaseRef, setLease)
  }, [])

  useLayoutEffect(() => {
    leaseRef.current = lease
    ackedRef.current = acked
  }, [acked, lease])

  const onHolder = useCallback((holder: ControllerHolder) => {
    acceptHolder(holder, ackedRef, idRef, leaseRef, setReplaced, setLease)
  }, [])

  const { show, connected, unauthorized, now, send } = useShow({
    controllerId: lease === "active" ? id : null,
    onDisplaced: markDisplaced,
    onHolder,
  })

  const claimKey = id
    ? (["controller-claim", id, claimTicket.n, claimTicket.force] as const)
    : null
  const claim = useSWR(claimKey, fetchClaim, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
    dedupingInterval: 2_000,
  })

  const heartbeatKey =
    id && lease === "active"
      ? (["controller-heartbeat", id, appliedEpoch] as const)
      : null
  const heartbeat = useSWR(heartbeatKey, fetchHeartbeat, {
    refreshInterval: heartbeatKey ? HEARTBEAT_MS : 0,
    refreshWhenHidden: true,
    refreshWhenOffline: true,
    revalidateOnMount: false,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 1_000,
    shouldRetryOnError: false,
  })

  const { trigger: releaseController } = useSWRMutation(
    id ? (["controller-release", id] as const) : null,
    releaseControllerLease,
  )

  useEffect(() => {
    const timer = setTimeout(() => setId(clientControllerId()), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    idRef.current = id
  }, [id])

  const bumpClaim = useCallback((force: boolean) => {
    setClaimTicket((ticket) => ({ force, n: ticket.n + 1 }))
  }, [])

  const requestTakeover = useCallback(() => {
    bumpClaim(false)
  }, [bumpClaim])

  const confirmTakeover = useCallback(() => {
    bumpClaim(true)
  }, [bumpClaim])

  const cancelTakeover = useCallback(() => {
    commitLease("inactive")
  }, [commitLease])

  useEffect(() => {
    if (!id) return
    const release = () => {
      releaseActiveLease(leaseRef, setLease, (epoch) =>
        releaseController(epoch, { throwOnError: false }),
      )
    }
    const onPageShow = (event: PageTransitionEvent) => {
      reclaimPersistedPage(event, () => bumpClaim(false))
    }
    window.addEventListener("pagehide", release)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.removeEventListener("pagehide", release)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [bumpClaim, id, releaseController])

  applyResolvedClaim(
    claim.data,
    appliedEpoch,
    setAppliedEpoch,
    setLease,
    setAcked,
    setReplaced,
    setClaimUnauthorized,
  )
  applyHeartbeat(
    heartbeat.data,
    seenHeartbeat,
    lease,
    setSeenHeartbeat,
    setLease,
    setClaimUnauthorized,
  )

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
