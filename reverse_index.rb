require 'fast-stemmer'
require 'json'

index = Hash.new{ 0 }

ARGF.each_line do |line|
  thread = JSON.parse(File.read("indexable_threads/" + line.strip))
  tokens = (thread['subject'] || "").split(" ") + thread['body'].split(" ")

  ['bcc', 'cc', 'from', 'to', 'replyto', 'listid', 'deliveredto', 'rfc822msgid'].each do |fields|
    fields.split(",").each do |field|
      tokens += [field] + field.split(/[.@<>\s]/)
    end
  end
  tokens += thread['labels']

  tokens.each do |token|
    index[token.downcase.gsub(/[^0-9a-z]/, '').stem] += 1
  end
end

index.each_pair{ |(k, v)|
  unless v == ""
    puts "#{v}\t#{k}"
  end
}
