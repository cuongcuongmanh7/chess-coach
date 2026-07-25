export const CLOUD_OWNER_EMAIL = "cuongruby12@gmail.com";
export const CLOUD_OWNER_UID = "Eh6jcgC6cpNJUPdsN1iLzfErxrw1";
export const CLOUD_OWNER_ONLY_MESSAGE = `Cloud cá nhân chỉ dành cho ${CLOUD_OWNER_EMAIL}.`;

type CloudIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

export function isCloudOwner(identity: CloudIdentity) {
  return identity.uid === CLOUD_OWNER_UID
    && identity.email?.toLowerCase() === CLOUD_OWNER_EMAIL
    && identity.emailVerified;
}
