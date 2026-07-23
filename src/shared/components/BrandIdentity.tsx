import type { AiProvider } from "../types/tauri";

const GEMINI_ICON = "data:image/webp;base64,UklGRmwCAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSOUAAAABgFRr29rotVCuh0RAYf9XDslIXBREtAMiCg6C62T/DgT+7z0z+4iYAPzXw6EaKRaSgVZMRlo1WUltSNIpPX49hJZsXOmkTYnMga07kTk7zjTKLrnEJzu/CZzZ82R2Ye+z0Ts9Xi1mBb1mU28Het/5Wac0TBb93IvGd9cpjCsKVnHQNKTwUG7wCwjiWqGKAnTdPK2eDr2XiUWygteDvz18z3I/+QyGbz7eYHvpd4b1sc8J9m/dblDMu+SQnHWZamDftoVq0pRAdtm01MHj1x3C7pdTQk1WkI7JSCskAy2QEB8O1f5QAFZQOCBgAQAAkAoAnQEqMAAwAD5tLJBFpCKhlxWYQAbEtgMUAHtyc+M6NXjo+MV1fmf8peIDmJ9wr+0G+Af2n/Aeop6mfoAeWP7Cv7ZelMGFcnSCSkk/tKOSCKIr6EJ9TJvQnmwAAP7+pTc1aBn9gvsu0mLuyPszJFm00XAsnRzPLWvyY+b4Sm6wR5DVPcdz6NVneAF1GuLi0Bf5CZGV1b/1Y1mGd9cNUgv6+F9RscjwIITHXMoeIiA1r2DqBadxOEojbeYlNxd45WMHLQqs5/ShLEzC+McBVGfFBQDIQ6sXxdtiU3fTX+sHE5+q2X+ZsVFOBwb1P9pppWHyhORz8dfPnQkrRpiUM51yhwgLd2Anm+W4GwMmLV0ha13VOYcgGI6lXLu0tVomXAIv3R/OXzR38ACtRKP/ZfrMiwsMITaZRwwl2I5K8IpTwBSokD20gu20lbK9zek4VvLuv/6yl7sTCWm0k/qAAA==";

type BrandIconProps = {
  brand: AiProvider | "google";
  size?: number;
  className?: string;
};

type AccountAvatarProps = {
  photoUrl?: string | null;
  fallback: string;
  className: string;
};

export function BrandIcon({ brand, size = 16, className = "" }: BrandIconProps) {
  if (brand === "google") {
    return (
      <svg className={`brand-icon google-brand-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.39a4.61 4.61 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.97-4.33 2.97-7.39Z" />
        <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.38l-3.24-2.53c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.6A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.41 13.92A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.32.31-1.92v-2.6H3.07A10 10 0 0 0 2 12c0 1.62.39 3.15 1.07 4.52l3.34-2.6Z" />
        <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.6C7.2 7.71 9.4 5.95 12 5.95Z" />
      </svg>
    );
  }

  if (brand === "gemini") {
    return (
      <img className={`brand-icon gemini-brand-icon ${className}`} width={size} height={size} src={GEMINI_ICON} alt="" aria-hidden="true" />
    );
  }

  return (
    <svg className={`brand-icon openai-brand-icon ${className}`} width={size} height={size} viewBox="146 227 268 265" aria-hidden="true">
      <path fill="currentColor" d="M249.176 323.434V298.276c0-2.118.795-3.707 2.649-4.767l50.581-29.128c6.884-3.972 15.094-5.826 23.567-5.826 31.777 0 51.904 24.63 51.904 50.844 0 1.854 0 3.972-.266 6.091l-52.433-30.719c-3.177-1.852-6.356-1.852-9.533 0l-66.469 38.663Zm118.107 97.981v-60.114c0-3.709-1.589-6.356-4.767-8.209l-66.468-38.662 21.715-12.448c1.854-1.057 3.443-1.057 5.295 0l50.581 29.13c14.566 8.474 24.364 26.48 24.364 43.957 0 20.126-11.916 38.664-30.72 46.343v.003Zm-133.73-52.963-21.715-12.71c-1.852-1.058-2.648-2.647-2.648-4.767v-58.257c0-28.335 21.715-49.786 51.111-49.786 11.122 0 21.447 3.709 30.189 10.328l-52.169 30.189c-3.175 1.854-4.766 4.502-4.766 8.21v76.796l-.002-.003Zm46.739 27.01-31.116-17.477v-37.072l31.116-17.477 31.115 17.477v37.072l-31.115 17.477Zm19.994 80.506c-11.123 0-21.449-3.709-30.189-10.328l52.167-30.191c3.177-1.852 4.766-4.5 4.766-8.21v-76.794l21.981 12.71c1.854 1.058 2.649 2.647 2.649 4.767v58.257c0 28.335-21.981 49.786-51.374 49.786v.003Zm-62.761-59.053-50.581-29.13c-14.566-8.475-24.362-26.48-24.362-43.958 0-20.391 12.181-38.663 30.981-46.342v60.376c0 3.71 1.591 6.356 4.767 8.21l66.205 38.396-21.715 12.448c-1.853 1.057-3.443 1.057-5.295 0Zm-2.911 43.428c-29.925 0-51.904-22.51-51.904-50.315 0-2.118.266-4.236.528-6.356l52.167 30.191c3.177 1.852 6.358 1.852 9.533 0l66.469-38.397v25.156c0 2.12-.795 3.709-2.649 4.767l-50.579 29.13c-6.886 3.972-15.096 5.824-23.568 5.824h.003Zm65.672 31.511c32.043 0 58.787-22.772 64.881-52.962 29.658-7.681 48.725-35.486 48.725-63.819 0-18.538-7.944-36.544-22.244-49.521 1.324-5.561 2.118-11.122 2.118-16.682 0-37.867-30.718-66.204-66.204-66.204-7.149 0-14.034 1.057-20.918 3.443-11.919-11.652-28.337-19.067-46.343-19.067-32.043 0-58.788 22.773-64.881 52.962-29.659 7.681-48.726 35.486-48.726 63.82 0 18.538 7.944 36.544 22.244 49.52-1.325 5.562-2.119 11.123-2.119 16.683 0 37.867 30.719 66.204 66.205 66.204 7.148 0 14.034-1.058 20.919-3.443 11.916 11.653 28.335 19.066 46.343 19.066Z" />
    </svg>
  );
}

export function AccountAvatar({ photoUrl, fallback, className }: AccountAvatarProps) {
  return (
    <span className={`account-photo ${className}`} aria-hidden="true">
      <span>{fallback}</span>
      {photoUrl && <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    </span>
  );
}
