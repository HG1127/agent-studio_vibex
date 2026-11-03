import {useEffect,useRef,useState} from "react"

/** Browser-owned timeline scroll, never window scroll. Used by the Run center
 * and detailed run view to prevent new events from moving unrelated panels.
 */
export function timelineNearBottom(metrics:{
  scrollTop:number;scrollHeight:number;clientHeight:number
},margin=64):boolean{
  return metrics.scrollHeight-metrics.clientHeight-metrics.scrollTop<=margin
}
export function useTimelineFollow(eventCount:number,visible:boolean,autoFollow=true){
  const viewportRef=useRef<HTMLDivElement|null>(null)
  const followRef=useRef(true)
  const [following,setFollowing]=useState(true)
  const [seenCount,setSeenCount]=useState(eventCount)
  const onScroll=()=>{
    const viewport=viewportRef.current
    if(!visible||!viewport)return
    const atBottom=timelineNearBottom(viewport)
    const wasFollowing=followRef.current
    followRef.current=atBottom
    setFollowing(atBottom)
    if(atBottom||wasFollowing)setSeenCount(eventCount)
  }
  const jumpToLatest=()=>{
    const viewport=viewportRef.current
    if(!viewport)return
    followRef.current=true
    setFollowing(true)
    setSeenCount(eventCount)
    viewport.scrollTop=viewport.scrollHeight
  }
  useEffect(()=>{
    if(!visible||!autoFollow||!followRef.current)return
    const viewport=viewportRef.current
    if(viewport)viewport.scrollTop=viewport.scrollHeight
  },[eventCount,visible,autoFollow])
  return {
    viewportRef,onScroll,jumpToLatest,
    following,
    unread:visible&&!following?Math.max(0,eventCount-seenCount):0,
  }
}
