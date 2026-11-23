import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import type { IconType } from "react-icons";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "x";

const icons: Record<SocialPlatform, IconType> = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  tiktok: FaTiktok,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  x: FaXTwitter,
};

export function SocialIcon({
  platform,
  className = "size-5",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const Icon = icons[platform];
  return <Icon className={className} aria-hidden="true" focusable="false" />;
}
