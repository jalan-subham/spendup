import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6c35f5',
          borderRadius: '4px',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderLeft: '3px solid #ffffff',
            borderBottom: '3px solid #ffffff',
            transform: 'rotate(-45deg) translate(2px, -2px)',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
