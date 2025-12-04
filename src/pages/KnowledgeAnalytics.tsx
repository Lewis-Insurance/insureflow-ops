import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  BarChart3,
  Search,
  Eye,
  ThumbsUp,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Clock,
  Users,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  useKnowledgeUsageStats,
  useKnowledgeSearchTrends,
  useKnowledgeGaps,
  useKnowledgeCategoryStats,
  useRefreshKnowledgeAnalytics,
  useTopKnowledgeEntries,
  useMostHelpfulEntries,
} from "@/hooks/useKnowledgeAnalytics";
import { formatDistanceToNow } from "date-fns";

export default function KnowledgeAnalytics() {
  const [selectedTab, setSelectedTab] = useState("overview");

  const { data: usageStats, isLoading: isLoadingUsage } = useKnowledgeUsageStats(100);
  const { data: searchTrends, isLoading: isLoadingSearch } = useKnowledgeSearchTrends(50);
  const { data: knowledgeGaps, isLoading: isLoadingGaps } = useKnowledgeGaps(30);
  const { data: categoryStats, isLoading: isLoadingCategories } = useKnowledgeCategoryStats();
  const { data: topEntries } = useTopKnowledgeEntries(10);
  const { data: helpfulEntries } = useMostHelpfulEntries(10);

  const refreshAnalytics = useRefreshKnowledgeAnalytics();

  const isLoading = isLoadingUsage || isLoadingSearch || isLoadingGaps || isLoadingCategories;

  // Calculate overview metrics
  const totalInteractions = usageStats?.reduce((sum, stat) => sum + stat.total_interactions, 0) || 0;
  const totalViews = usageStats?.reduce((sum, stat) => sum + stat.view_count, 0) || 0;
  const totalSearches = usageStats?.reduce((sum, stat) => sum + stat.search_result_count, 0) || 0;
  const totalAIResponses = usageStats?.reduce((sum, stat) => sum + stat.ai_response_count, 0) || 0;
  const avgHelpfulness =
    usageStats
      ?.filter((stat) => stat.helpfulness_rate != null)
      .reduce((sum, stat) => sum + (stat.helpfulness_rate || 0), 0) /
      usageStats?.filter((stat) => stat.helpfulness_rate != null).length || 0;

  const totalGapQueries = knowledgeGaps?.reduce((sum, gap) => sum + gap.search_count, 0) || 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Analytics</h1>
          <p className="text-muted-foreground">
            Track usage patterns, search trends, and knowledge base effectiveness
          </p>
        </div>
        <Button
          onClick={() => refreshAnalytics.mutate()}
          disabled={refreshAnalytics.isPending}
          variant="outline"
        >
          {refreshAnalytics.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Analytics
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Interactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{totalInteractions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold">{totalViews.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Responses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold">{totalAIResponses.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Helpfulness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-yellow-600" />
              <span className="text-2xl font-bold">{avgHelpfulness.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="entries">Top Entries</TabsTrigger>
          <TabsTrigger value="searches">Search Trends</TabsTrigger>
          <TabsTrigger value="gaps">Knowledge Gaps</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Performing Entries */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Performing Entries
                </CardTitle>
                <CardDescription>Most accessed knowledge entries</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : topEntries && topEntries.length > 0 ? (
                  <div className="space-y-3">
                    {topEntries.slice(0, 5).map((entry, index) => (
                      <div
                        key={entry.knowledge_id}
                        className="flex items-start justify-between border-b pb-3 last:border-b-0"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <span className="font-medium text-sm">{entry.title}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {entry.view_count} views
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {entry.unique_users} users
                            </span>
                          </div>
                        </div>
                        <Badge>{entry.category}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>No usage data available yet.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Most Helpful Entries */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ThumbsUp className="h-5 w-5" />
                  Most Helpful Entries
                </CardTitle>
                <CardDescription>Highest rated by users</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : helpfulEntries && helpfulEntries.length > 0 ? (
                  <div className="space-y-3">
                    {helpfulEntries.slice(0, 5).map((entry) => (
                      <div
                        key={entry.knowledge_id}
                        className="flex items-start justify-between border-b pb-3 last:border-b-0"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{entry.title}</div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3 text-green-600" />
                              {entry.helpful_votes} helpful
                            </span>
                            <span>
                              {entry.helpfulness_rate?.toFixed(0)}% helpfulness rate
                            </span>
                          </div>
                        </div>
                        <Badge>{entry.category}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>No feedback data available yet.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Knowledge Gaps Alert */}
          {knowledgeGaps && knowledgeGaps.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{knowledgeGaps.length} knowledge gaps identified</strong> with{" "}
                {totalGapQueries} total queries returning no results. Consider adding content
                for these topics.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Entries Tab */}
        <TabsContent value="entries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Knowledge Entries - Usage Statistics</CardTitle>
              <CardDescription>
                Comprehensive usage data for all knowledge base entries
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : usageStats && usageStats.length > 0 ? (
                <div className="space-y-2">
                  {usageStats.map((stat) => (
                    <div
                      key={stat.knowledge_id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-semibold">{stat.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {stat.category}
                            {stat.tags && stat.tags.length > 0 && (
                              <span className="ml-2">
                                {stat.tags.map((tag, i) => (
                                  <Badge key={i} variant="secondary" className="ml-1 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline">{stat.total_interactions} interactions</Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Views</div>
                          <div className="font-medium">{stat.view_count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">AI Responses</div>
                          <div className="font-medium">{stat.ai_response_count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Helpfulness</div>
                          <div className="font-medium">
                            {stat.helpfulness_rate ? `${stat.helpfulness_rate.toFixed(0)}%` : "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Last Accessed</div>
                          <div className="font-medium">
                            {stat.last_accessed_at
                              ? formatDistanceToNow(new Date(stat.last_accessed_at), {
                                  addSuffix: true,
                                })
                              : "Never"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No usage statistics available yet.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Trends Tab */}
        <TabsContent value="searches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Query Trends
              </CardTitle>
              <CardDescription>Most common search queries and their performance</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : searchTrends && searchTrends.length > 0 ? (
                <div className="space-y-2">
                  {searchTrends.map((trend) => (
                    <div
                      key={trend.normalized_query}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium">{trend.example_query}</div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{trend.search_count} searches</span>
                            <span>{trend.unique_users} users</span>
                            <span>
                              {trend.avg_results_per_search.toFixed(1)} avg results
                            </span>
                          </div>
                        </div>
                        {trend.is_knowledge_gap && (
                          <Badge variant="destructive">Knowledge Gap</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">Click Rate</div>
                          <div className="font-medium">
                            {trend.click_through_rate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Avg Relevance</div>
                          <div className="font-medium">
                            {trend.avg_relevance ? (trend.avg_relevance * 100).toFixed(0) : 0}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Last Searched</div>
                          <div className="font-medium">
                            {formatDistanceToNow(new Date(trend.last_searched_at), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No search data available yet.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge Gaps Tab */}
        <TabsContent value="gaps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Knowledge Gaps
              </CardTitle>
              <CardDescription>
                Queries with no results - opportunities to add content
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : knowledgeGaps && knowledgeGaps.length > 0 ? (
                <div className="space-y-2">
                  {knowledgeGaps.map((gap) => (
                    <div
                      key={gap.normalized_query}
                      className="p-4 border border-destructive/50 rounded-lg bg-destructive/5"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium">{gap.example_query}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {gap.search_count} searches with no results ({gap.no_results_rate.toFixed(0)}% failure rate)
                          </div>
                        </div>
                        <Badge variant="destructive">Action Needed</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">Unique Users</div>
                          <div className="font-medium">{gap.unique_users}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Last Attempt</div>
                          <div className="font-medium">
                            {formatDistanceToNow(new Date(gap.last_searched_at), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No knowledge gaps identified - all queries are returning results!
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Category Coverage Analysis
              </CardTitle>
              <CardDescription>Usage and coverage statistics by category</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : categoryStats && categoryStats.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categoryStats.map((cat) => (
                    <div key={cat.category} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold capitalize">{cat.category}</h3>
                        <Badge variant="outline">{cat.entry_count} entries</Badge>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Views</span>
                          <span className="font-medium">{cat.total_views.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">AI Responses</span>
                          <span className="font-medium">
                            {cat.total_ai_responses.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg Helpfulness</span>
                          <span className="font-medium">
                            {cat.avg_helpfulness_rate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Updated</span>
                          <span className="font-medium">
                            {formatDistanceToNow(new Date(cat.last_updated_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No category data available yet.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
