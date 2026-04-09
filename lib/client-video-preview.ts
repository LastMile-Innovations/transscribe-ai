export async function extractLocalVideoPreview(
  file: File,
  id: string,
): Promise<{
  duration: number
  thumbnailUrl: string
  videoWidth: number
  videoHeight: number
}> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = objectUrl

  return new Promise((resolve) => {
    let duration = 0
    let thumbnailUrl = `https://picsum.photos/seed/${id}/640/360`
    let resolved = false
    let safetyTimeout: number

    const finish = (nextDuration: number, nextThumbnailUrl: string) => {
      if (resolved) return
      resolved = true
      const videoWidth = video.videoWidth || 0
      const videoHeight = video.videoHeight || 0
      window.clearTimeout(safetyTimeout)
      URL.revokeObjectURL(objectUrl)
      video.src = ''
      resolve({ duration: nextDuration, thumbnailUrl: nextThumbnailUrl, videoWidth, videoHeight })
    }

    safetyTimeout = window.setTimeout(() => finish(duration || 60000, thumbnailUrl), 10_000)

    video.onloadedmetadata = () => {
      const seconds = video.duration
      if (Number.isFinite(seconds) && seconds > 0) {
        duration = Math.round(seconds * 1000)
      }
    }

    video.onloadeddata = () => {
      const seconds = video.duration
      if (!Number.isFinite(seconds) || seconds <= 0) {
        finish(duration || 60000, thumbnailUrl)
        return
      }
      const seekTime = Math.min(1, Math.max(0, seconds - 0.1))
      video.currentTime = seekTime || 0
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth / 4
        canvas.height = video.videoHeight / 4
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
        thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7)
      } catch (error) {
        console.error('Failed to generate thumbnail', error)
      }
      finish(duration, thumbnailUrl)
    }

    video.onerror = () => finish(60000, thumbnailUrl)
  })
}
