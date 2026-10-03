import CategoryTabs from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";

export default function ExplorePage() {
  return <main className="min-w-0 flex-1 p-3 sm:p-4"><CategoryTabs /><div className="mb-5 mt-4"><h1 className="text-2xl font-bold">Explore</h1><p className="text-sm text-muted-foreground">Discover videos from across Yuutube.</p></div><Videogrid /></main>;
}
