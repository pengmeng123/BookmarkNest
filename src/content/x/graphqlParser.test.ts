import { describe, expect, it } from 'vitest';

import { parseGraphqlBookmarks } from './graphqlParser';

describe('parseGraphqlBookmarks', () => {
  it('extracts timeline tweets and preserves X sortIndex order', () => {
    const response = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                entries: [
                  {
                    entryId: 'tweet-2',
                    sortIndex: '900',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            rest_id: '2',
                            core: {
                              user_results: {
                                result: {
                                  legacy: {
                                    name: 'Later User',
                                    screen_name: 'later',
                                    profile_image_url_https: 'https://pbs.twimg.com/profile_images/later.jpg'
                                  }
                                }
                              }
                            },
                            legacy: {
                              full_text: 'Second item',
                              created_at: 'Wed Jun 24 10:00:00 +0000 2026',
                              extended_entities: {
                                media: [{ media_url_https: 'https://pbs.twimg.com/media/second.jpg' }]
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    entryId: 'tweet-1',
                    sortIndex: '1000',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            rest_id: '1',
                            core: {
                              user_results: {
                                result: {
                                  legacy: {
                                    name: 'First User',
                                    screen_name: 'first'
                                  }
                                }
                              }
                            },
                            legacy: {
                              full_text: 'First item',
                              created_at: 'Wed Jun 24 11:00:00 +0000 2026'
                            }
                          }
                        }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    };

    const bookmarks = parseGraphqlBookmarks(response);

    expect(bookmarks.map((bookmark) => bookmark.input.tweetId)).toEqual(['1', '2']);
    expect(bookmarks[0].input).toMatchObject({
      tweetUrl: 'https://x.com/first/status/1',
      authorName: 'First User',
      authorHandle: 'first',
      contentText: 'First item'
    });
    expect(bookmarks[1].input.mediaUrls).toEqual(['https://pbs.twimg.com/media/second.jpg']);
  });

  it('reads author fields from the new core/avatar schema', () => {
    const response = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-9',
                    sortIndex: '950',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            rest_id: '9',
                            core: {
                              user_results: {
                                result: {
                                  __typename: 'User',
                                  rest_id: '777',
                                  core: {
                                    name: 'Core User',
                                    screen_name: 'coreuser'
                                  },
                                  avatar: {
                                    image_url: 'https://pbs.twimg.com/profile_images/core.jpg'
                                  },
                                  legacy: {}
                                }
                              }
                            },
                            legacy: {
                              full_text: 'New schema tweet',
                              created_at: 'Wed Jun 24 12:00:00 +0000 2026'
                            }
                          }
                        }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    };

    const bookmarks = parseGraphqlBookmarks(response);

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].input).toMatchObject({
      tweetId: '9',
      tweetUrl: 'https://x.com/coreuser/status/9',
      authorName: 'Core User',
      authorHandle: 'coreuser',
      authorAvatarUrl: 'https://pbs.twimg.com/profile_images/core.jpg',
      contentText: 'New schema tweet'
    });
  });

  it('parses TweetWithVisibilityResults wrappers with nested user data', () => {
    const response = {
      data: {
        bookmarks: {
          entries: [
            {
              entryId: 'tweet-3',
              sortIndex: '800',
              content: {
                itemContent: {
                  tweet_results: {
                    result: {
                      __typename: 'TweetWithVisibilityResults',
                      tweet: {
                        __typename: 'Tweet',
                        rest_id: '3',
                        core: {
                          user_results: {
                            result: {
                              user: {
                                legacy: {
                                  name: 'Nested User',
                                  screen_name: 'nested',
                                  profile_image_url_https: 'https://pbs.twimg.com/profile_images/nested.jpg'
                                }
                              }
                            }
                          }
                        },
                        legacy: {
                          full_text: 'Nested tweet',
                          created_at: 'Wed Jun 24 09:00:00 +0000 2026'
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    };

    const bookmarks = parseGraphqlBookmarks(response);

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].input).toMatchObject({
      tweetId: '3',
      tweetUrl: 'https://x.com/nested/status/3',
      authorName: 'Nested User',
      authorHandle: 'nested',
      authorAvatarUrl: 'https://pbs.twimg.com/profile_images/nested.jpg'
    });
  });

  it('keeps API tweets when X omits author profile fields', () => {
    const response = {
      data: {
        bookmarks: {
          entries: [
            {
              entryId: 'tweet-4',
              sortIndex: '700',
              content: {
                itemContent: {
                  tweet_results: {
                    result: {
                      __typename: 'Tweet',
                      rest_id: '4',
                      core: {
                        user_results: {
                          result: {
                            rest_id: '123456'
                          }
                        }
                      },
                      legacy: {
                        full_text: 'No author'
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    };

    const bookmarks = parseGraphqlBookmarks(response);

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].input).toMatchObject({
      tweetId: '4',
      tweetUrl: 'https://x.com/i/web/status/4',
      authorName: 'User 123456',
      authorHandle: 'user_123456',
      contentText: 'No author'
    });
  });

  it('prefers note_tweet text for long posts', () => {
    const response = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                entries: [
                  {
                    entryId: 'tweet-5',
                    sortIndex: '600',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            rest_id: '5',
                            core: {
                              user_results: {
                                result: {
                                  legacy: {
                                    name: 'Long User',
                                    screen_name: 'longuser'
                                  }
                                }
                              }
                            },
                            note_tweet: {
                              note_tweet_results: {
                                result: {
                                  text: 'Full long post text'
                                }
                              }
                            },
                            legacy: {
                              full_text: 'Truncated...',
                              created_at: 'Wed Jun 24 09:00:00 +0000 2026'
                            }
                          }
                        }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    };

    expect(parseGraphqlBookmarks(response)[0].input.contentText).toBe('Full long post text');
  });

  it('keeps unavailable timeline entries so import counts match X', () => {
    const response = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-6',
                    sortIndex: '500',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: null
                        }
                      }
                    }
                  },
                  {
                    entryId: 'tweet-7',
                    sortIndex: '400',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'TweetTombstone',
                            tombstone: {
                              text: {
                                text: 'This post is unavailable'
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    };

    const bookmarks = parseGraphqlBookmarks(response);

    expect(bookmarks.map((bookmark) => bookmark.input.tweetId)).toEqual(['6', '7']);
    expect(bookmarks[0].input.contentText).toBe('Tweet unavailable');
    expect(bookmarks[1].input.contentText).toBe('This post is unavailable');
  });
});
